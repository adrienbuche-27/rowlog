import { Emitter } from '../lib/emitter'
import { FTMS_SERVICE, ROWER_DATA_CHAR, hex, parseRowerData } from './ftms'
import type { ConnectionInfo, RowerSource, RowerSourceEvents } from './types'

const KNOWN_DEVICE_KEY = 'rowlog.knownDeviceId'

export interface BluetoothRowerOptions {
  /** Delays between reconnection attempts, in ms. The last value repeats forever. */
  backoffMs?: number[]
  /** Timeout for a single GATT connection attempt. Chrome can hang without one. */
  connectTimeoutMs?: number
  /**
   * If connected but silent for this long, force a reconnect. The ComModule normally notifies
   * about once per second, so prolonged silence usually means a half-dead link.
   * Set to 0 to disable.
   */
  silenceTimeoutMs?: number
  /** Log raw packets to the "log" event (useful to inspect your ComModule's behaviour). */
  debugPackets?: boolean
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

export function isBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

export class BluetoothRower extends Emitter<RowerSourceEvents> implements RowerSource {
  readonly kind = 'bluetooth' as const
  info: ConnectionInfo = { state: 'disconnected', attempt: 0, deviceName: null, error: null }

  private device: BluetoothDevice | null = null
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null
  private userDisconnect = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private silenceTimer: ReturnType<typeof setInterval> | null = null
  private lastPacketAt = 0
  private readonly opts: Required<BluetoothRowerOptions>

  constructor(options: BluetoothRowerOptions = {}) {
    super()
    this.opts = {
      backoffMs: options.backoffMs ?? [500, 1000, 2000, 4000, 8000, 10000],
      connectTimeoutMs: options.connectTimeoutMs ?? 12000,
      silenceTimeoutMs: options.silenceTimeoutMs ?? 30000,
      debugPackets: options.debugPackets ?? false,
    }
  }

  /** Opens the browser device picker. Must be called from a user gesture (click). */
  async connect(): Promise<void> {
    if (!isBluetoothSupported()) {
      throw new Error('Bluetooth is not available in this browser. Use Chrome or Edge on desktop.')
    }
    this.userDisconnect = false
    this.setInfo({ state: 'connecting', attempt: 0, error: null })
    try {
      const device = await navigator.bluetooth.requestDevice({
        // The ComModule usually advertises a name starting with "S4"; the FTMS filter covers others.
        filters: [{ services: [FTMS_SERVICE] }, { namePrefix: 'S4' }, { namePrefix: 'WR' }],
        optionalServices: [FTMS_SERVICE],
      })
      await this.attach(device)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Closing the device picker is not an error worth showing.
      const cancelled = err instanceof DOMException && err.name === 'NotFoundError'
      this.setInfo({ state: 'disconnected', error: cancelled ? null : message })
      if (!cancelled) throw err
    }
  }

  /**
   * After a page reload, reconnect to the previously paired device without the picker.
   * Requires navigator.bluetooth.getDevices(), which Chrome exposes only with
   * chrome://flags/#enable-web-bluetooth-new-permissions-backend enabled.
   */
  async reconnectKnownDevice(): Promise<boolean> {
    if (!isBluetoothSupported()) return false
    const bt = navigator.bluetooth as Bluetooth & { getDevices?: () => Promise<BluetoothDevice[]> }
    const knownId = localStorage.getItem(KNOWN_DEVICE_KEY)
    if (!bt.getDevices || !knownId) return false
    const device = (await bt.getDevices()).find((d) => d.id === knownId)
    if (!device) return false
    this.userDisconnect = false
    this.setInfo({ state: 'connecting', attempt: 0, error: null })
    try {
      await this.attach(device)
      return true
    } catch (err) {
      this.setInfo({ state: 'disconnected', error: err instanceof Error ? err.message : String(err) })
      return false
    }
  }

  async disconnect(): Promise<void> {
    this.userDisconnect = true
    this.clearTimers()
    await this.detachCharacteristic()
    if (this.device?.gatt?.connected) this.device.gatt.disconnect()
    this.setInfo({ state: 'disconnected', attempt: 0, error: null })
  }

  private async attach(device: BluetoothDevice): Promise<void> {
    if (this.device && this.device !== device) {
      this.device.removeEventListener('gattserverdisconnected', this.onGattDisconnected)
    }
    this.device = device
    device.addEventListener('gattserverdisconnected', this.onGattDisconnected)
    this.setInfo({ deviceName: device.name ?? 'WaterRower' })
    try {
      localStorage.setItem(KNOWN_DEVICE_KEY, device.id)
    } catch {
      /* storage unavailable */
    }
    await this.openGatt()
  }

  private async openGatt(): Promise<void> {
    const device = this.device
    if (!device?.gatt) throw new Error('Device has no GATT server')

    await this.detachCharacteristic()
    const server = await withTimeout(device.gatt.connect(), this.opts.connectTimeoutMs, 'GATT connect')
    const service = await server.getPrimaryService(FTMS_SERVICE)
    const characteristic = await service.getCharacteristic(ROWER_DATA_CHAR)
    characteristic.addEventListener('characteristicvaluechanged', this.onNotification)
    await characteristic.startNotifications()
    this.characteristic = characteristic

    this.lastPacketAt = Date.now()
    this.startSilenceWatchdog()
    this.setInfo({ state: 'connected', attempt: 0, error: null })
    this.log(`Connected to ${device.name ?? device.id}`)
  }

  private async detachCharacteristic(): Promise<void> {
    const c = this.characteristic
    this.characteristic = null
    if (!c) return
    c.removeEventListener('characteristicvaluechanged', this.onNotification)
    try {
      if (c.service.device.gatt?.connected) await c.stopNotifications()
    } catch {
      /* link already gone */
    }
  }

  private onNotification = (event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value
    if (!value) return
    this.lastPacketAt = Date.now()
    if (this.opts.debugPackets) this.log(`rx ${hex(value)}`)
    this.emit('data', parseRowerData(value))
  }

  private onGattDisconnected = () => {
    this.clearTimers()
    this.characteristic = null
    if (this.userDisconnect) {
      this.setInfo({ state: 'disconnected', attempt: 0 })
      return
    }
    this.log('Connection lost, reconnecting')
    this.scheduleReconnect(1)
  }

  private scheduleReconnect(attempt: number) {
    if (this.userDisconnect) return
    const { backoffMs } = this.opts
    const delay = backoffMs[Math.min(attempt - 1, backoffMs.length - 1)]
    this.setInfo({ state: 'reconnecting', attempt })
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      try {
        await this.openGatt()
      } catch (err) {
        this.log(`Reconnect attempt ${attempt} failed: ${err instanceof Error ? err.message : err}`)
        // A half-open link can leave gatt.connected true; reset it before retrying.
        try {
          if (this.device?.gatt?.connected) this.device.gatt.disconnect()
        } catch {
          /* ignore */
        }
        this.scheduleReconnect(attempt + 1)
      }
    }, delay)
  }

  private startSilenceWatchdog() {
    if (!this.opts.silenceTimeoutMs) return
    if (this.silenceTimer) clearInterval(this.silenceTimer)
    this.silenceTimer = setInterval(() => {
      const silent = Date.now() - this.lastPacketAt > this.opts.silenceTimeoutMs
      if (silent && this.device?.gatt?.connected) {
        this.log('No data received for a while, forcing a reconnect')
        this.device.gatt.disconnect() // fires gattserverdisconnected → reconnect loop
      }
    }, 5000)
  }

  private clearTimers() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.silenceTimer) clearInterval(this.silenceTimer)
    this.reconnectTimer = null
    this.silenceTimer = null
  }

  private setInfo(patch: Partial<ConnectionInfo>) {
    this.info = { ...this.info, ...patch }
    this.emit('connection', this.info)
  }

  private log(message: string) {
    this.emit('log', message)
  }
}
