import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import type { Sample } from '../api/types'
import { BluetoothRower, isBluetoothSupported } from '../ble/BluetoothRower'
import { SimulatedRower } from '../ble/SimulatedRower'
import type { ConnectionInfo, RowerSource } from '../ble/types'
import { beep } from '../lib/beep'
import { loadSettings, saveSettings, type AppSettings } from '../lib/settings'
import { useWakeLock } from '../lib/useWakeLock'
import { syncOutbox } from './outbox'
import { SessionRecorder, type LiveSnapshot, type PersistedSession } from './SessionRecorder'
import { storage } from './storage'

export type SourceKind = 'bluetooth' | 'simulator'

export interface FinishResult {
  workoutId: number | null
  queued: boolean
}

interface SessionContextValue {
  bluetoothSupported: boolean
  sourceKind: SourceKind
  setSourceKind: (kind: SourceKind) => void
  connection: ConnectionInfo
  simulator: SimulatedRower | null
  snapshot: LiveSnapshot
  samples: Sample[]
  /** Increments every tick; lets charts know samples changed (the array is mutated in place). */
  version: number

  connect: () => Promise<void>
  disconnect: () => Promise<void>
  start: () => void
  pause: () => void
  resume: () => void
  finish: (notes?: string) => Promise<FinishResult>
  discard: () => Promise<void>

  restorable: PersistedSession | null
  restore: () => void
  dismissRestorable: () => Promise<void>

  outboxPending: number
  outboxError: string | null
  syncNow: () => Promise<void>

  settings: AppSettings
  updateSettings: (patch: Partial<AppSettings>) => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

const PERSIST_EVERY_TICKS = 5
const idleConnection: ConnectionInfo = { state: 'disconnected', attempt: 0, deviceName: null, error: null }

export function SessionProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const [sourceKind, setSourceKindState] = useState<SourceKind>(
    isBluetoothSupported() ? 'bluetooth' : 'simulator',
  )
  const [connection, setConnection] = useState<ConnectionInfo>(idleConnection)
  const [version, setVersion] = useState(0)
  const [restorable, setRestorable] = useState<PersistedSession | null>(null)
  const [outboxPending, setOutboxPending] = useState(0)
  const [outboxError, setOutboxError] = useState<string | null>(null)

  const recorderRef = useRef(new SessionRecorder())
  const sourceRef = useRef<RowerSource | null>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  const persist = useCallback(async () => {
    const r = recorderRef.current
    if (r.status === 'recording' || r.status === 'paused') {
      await storage.saveActive(r.serialize(Date.now())).catch(() => {})
    }
  }, [])

  // --- Source lifecycle -------------------------------------------------------------------

  const bindSource = useCallback(
    (source: RowerSource) => {
      const offData = source.on('data', (data) => recorderRef.current.ingest(data, Date.now()))
      const offConn = source.on('connection', (info) => {
        setConnection((prev) => {
          const r = recorderRef.current
          if (info.state !== 'connected') r.setLinkUp(false)
          const dropped = prev.state === 'connected' && info.state === 'reconnecting'
          if (dropped && r.status === 'recording' && settingsRef.current.beepOnDrop) beep()
          return info
        })
      })
      const offLog = source.on('log', (msg) => console.info(`[rower] ${msg}`))
      return () => {
        offData()
        offConn()
        offLog()
      }
    },
    [],
  )

  const createSource = useCallback(
    (kind: SourceKind): RowerSource =>
      kind === 'bluetooth'
        ? new BluetoothRower({ debugPackets: settingsRef.current.debugPackets })
        : new SimulatedRower(),
    [],
  )

  const unbindRef = useRef<(() => void) | null>(null)

  const connect = useCallback(async () => {
    if (!sourceRef.current || sourceRef.current.kind !== sourceKind) {
      unbindRef.current?.()
      await sourceRef.current?.disconnect()
      sourceRef.current = createSource(sourceKind)
      unbindRef.current = bindSource(sourceRef.current)
    }
    try {
      await sourceRef.current.connect()
    } catch {
      /* error is exposed through connection.error */
    }
  }, [bindSource, createSource, sourceKind])

  const disconnect = useCallback(async () => {
    await sourceRef.current?.disconnect()
  }, [])

  const setSourceKind = useCallback(
    (kind: SourceKind) => {
      if (kind === sourceKind) return
      void sourceRef.current?.disconnect()
      unbindRef.current?.()
      unbindRef.current = null
      sourceRef.current = null
      setConnection(idleConnection)
      setSourceKindState(kind)
    },
    [sourceKind],
  )

  // --- Ticking, persistence, lifecycle ----------------------------------------------------

  useEffect(() => {
    let ticks = 0
    const id = setInterval(() => {
      const r = recorderRef.current
      r.tick(Date.now())
      ticks += 1
      if (ticks % PERSIST_EVERY_TICKS === 0) void persist()
      refresh()
    }, 1000)
    const onHide = () => void persist()
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      clearInterval(id)
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [persist, refresh])

  const sync = useCallback(async () => {
    const result = await syncOutbox().catch(() => ({ saved: [], pending: 0, error: null }))
    setOutboxPending(result.pending)
    setOutboxError(result.error)
    return result
  }, [])

  useEffect(() => {
    storage
      .loadActive()
      .then((s) => {
        if (s && s.samples.length > 1) setRestorable(s)
      })
      .catch(() => {})
    void sync()
    const onOnline = () => void sync()
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('online', onOnline)
      unbindRef.current?.()
      void sourceRef.current?.disconnect()
    }
  }, [sync])

  const status = recorderRef.current.status
  useWakeLock(status === 'recording' || status === 'paused' || status === 'armed')

  // --- Controls ---------------------------------------------------------------------------

  const start = useCallback(() => {
    const r = recorderRef.current
    if (r.status === 'finished') recorderRef.current = new SessionRecorder()
    if (settingsRef.current.startOnFirstStroke) recorderRef.current.arm()
    else recorderRef.current.start(Date.now())
    refresh()
  }, [refresh])

  const pause = useCallback(() => {
    recorderRef.current.pause(Date.now())
    void persist()
    refresh()
  }, [persist, refresh])

  const resume = useCallback(() => {
    recorderRef.current.resume(Date.now())
    refresh()
  }, [refresh])

  const reset = useCallback(async () => {
    recorderRef.current = new SessionRecorder()
    await storage.clearActive().catch(() => {})
    refresh()
  }, [refresh])

  const finish = useCallback(
    async (notes = ''): Promise<FinishResult> => {
      const r = recorderRef.current
      r.finish(Date.now())
      if (!r.hasContent()) {
        await reset()
        return { workoutId: null, queued: false }
      }
      const payload = r.toPayload(notes)
      await storage.addToOutbox(payload)
      await reset()

      const result = await sync()
      const saved = result.saved.find((w) => w.client_id === payload.client_id)
      if (saved && settingsRef.current.autoStrava) {
        api.uploadToStrava(saved.id).catch(() => {})
      }
      return { workoutId: saved?.id ?? null, queued: !saved }
    },
    [reset, sync],
  )

  const discard = useCallback(async () => {
    await reset()
  }, [reset])

  const restore = useCallback(() => {
    if (!restorable) return
    recorderRef.current = SessionRecorder.restore(restorable)
    setRestorable(null)
    refresh()
  }, [refresh, restorable])

  const dismissRestorable = useCallback(async () => {
    setRestorable(null)
    await storage.clearActive().catch(() => {})
  }, [])

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveSettings(next)
      return next
    })
  }, [])

  const value = useMemo<SessionContextValue>(() => {
    const r = recorderRef.current
    return {
      bluetoothSupported: isBluetoothSupported(),
      sourceKind,
      setSourceKind,
      connection,
      simulator: sourceRef.current instanceof SimulatedRower ? sourceRef.current : null,
      snapshot: r.snapshot(Date.now()),
      samples: r.samples,
      version,
      connect,
      disconnect,
      start,
      pause,
      resume,
      finish,
      discard,
      restorable,
      restore,
      dismissRestorable,
      outboxPending,
      outboxError,
      syncNow: async () => {
        await sync()
      },
      settings,
      updateSettings,
    }
    // version is the heartbeat that recomputes the snapshot every second
  }, [
    version, sourceKind, setSourceKind, connection, connect, disconnect, start, pause, resume,
    finish, discard, restorable, restore, dismissRestorable, outboxPending, outboxError, sync,
    settings, updateSettings,
  ])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>')
  return ctx
}
