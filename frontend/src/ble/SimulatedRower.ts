import { Emitter } from '../lib/emitter'
import { encodeRowerData, parseRowerData } from './ftms'
import type { ConnectionInfo, RowerSource, RowerSourceEvents } from './types'

/**
 * A fake WaterRower for development without the machine.
 *
 * It mimics the ComModule: two notifications per second, each with a subset of fields,
 * encoded to bytes and parsed back so the real parser runs. It can also simulate dropouts
 * and monitor resets to exercise the recording logic.
 */
export class SimulatedRower extends Emitter<RowerSourceEvents> implements RowerSource {
  readonly kind = 'simulator' as const
  info: ConnectionInfo = { state: 'disconnected', attempt: 0, deviceName: null, error: null }

  rowing = true
  /** Target split in seconds per 500 m. */
  targetPace = 125

  private timer: ReturnType<typeof setInterval> | null = null
  private distance = 0
  private strokes = 0
  private energy = 0
  private elapsed = 0
  private droppedUntil = 0
  private heartRate = 95

  async connect(): Promise<void> {
    this.setInfo({ state: 'connecting', error: null })
    await new Promise((r) => setTimeout(r, 400))
    this.setInfo({ state: 'connected', attempt: 0, deviceName: 'Simulated S4' })
    this.timer ??= setInterval(() => this.step(), 1000)
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.setInfo({ state: 'disconnected', attempt: 0 })
  }

  /** Stop sending for `seconds`, as if the Bluetooth link dropped. */
  simulateDropout(seconds = 8, resetMonitor = false) {
    this.droppedUntil = Date.now() + seconds * 1000
    this.setInfo({ state: 'reconnecting', attempt: 1 })
    if (resetMonitor) {
      this.distance = 0
      this.strokes = 0
      this.energy = 0
      this.elapsed = 0
    }
  }

  private step() {
    const now = Date.now()
    if (now < this.droppedUntil) {
      this.setInfo({ state: 'reconnecting', attempt: this.info.attempt + 1 })
      return
    }
    if (this.info.state !== 'connected') this.setInfo({ state: 'connected', attempt: 0 })

    let pace = 0
    let spm = 0
    let power = 0
    if (this.rowing) {
      pace = this.targetPace + Math.sin(now / 9000) * 4 + (Math.random() - 0.5) * 2
      spm = Math.round((20 + (125 - pace) / 4 + Math.random()) * 2) / 2
      power = 2.8 / Math.pow(pace / 500, 3) // Concept2 watts formula
      this.distance += 500 / pace
      this.strokes += spm / 60
      this.energy += (power * 4) / 4184 + 0.02
      this.heartRate = Math.min(165, this.heartRate + 0.15)
    } else {
      this.heartRate = Math.max(90, this.heartRate - 0.3)
    }
    this.elapsed += 1

    // Packet 1: stroke data, distance, pace, power
    this.emitPacket(
      encodeRowerData({
        strokeRate: spm,
        strokeCount: Math.floor(this.strokes),
        totalDistance: this.distance,
        instantPace: pace,
        instantPower: power,
      }),
    )
    // Packet 2: "More Data" flag set, energy, heart rate, elapsed time
    this.emitPacket(
      encodeRowerData({
        totalEnergy: this.energy,
        energyPerHour: power * 3.6,
        energyPerMinute: power / 60,
        heartRate: Math.round(this.heartRate),
        elapsedTime: this.elapsed,
      }),
    )
  }

  private emitPacket(view: DataView) {
    this.emit('data', parseRowerData(view))
  }

  private setInfo(patch: Partial<ConnectionInfo>) {
    this.info = { ...this.info, ...patch }
    this.emit('connection', this.info)
  }
}
