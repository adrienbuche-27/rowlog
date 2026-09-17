import type { RowerData } from './ftms'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export interface ConnectionInfo {
  state: ConnectionState
  /** Reconnection attempt number while state is "reconnecting". */
  attempt: number
  deviceName: string | null
  error: string | null
}

export interface RowerSourceEvents {
  data: RowerData
  connection: ConnectionInfo
  log: string
}

/** Anything that produces rower data: the real ComModule or the simulator. */
export interface RowerSource {
  readonly kind: 'bluetooth' | 'simulator'
  readonly info: ConnectionInfo
  connect(): Promise<void>
  disconnect(): Promise<void>
  on<K extends keyof RowerSourceEvents>(event: K, cb: (payload: RowerSourceEvents[K]) => void): () => void
}
