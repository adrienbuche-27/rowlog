import type { Sample, WorkoutCreate } from '../api/types'
import type { RowerData } from '../ble/ftms'
import { CumulativeCounter } from './CumulativeCounter'

export type SessionStatus = 'idle' | 'armed' | 'recording' | 'paused' | 'finished'

/** What gets persisted to IndexedDB so a crash or reload never loses a workout. */
export interface PersistedSession {
  id: string
  status: SessionStatus
  startedAt: number | null
  elapsedMs: number
  samples: Sample[]
  counters: { distance: number; strokes: number; energy: number }
  savedAt: number
}

export interface LiveSnapshot {
  status: SessionStatus
  elapsedS: number
  distance: number
  strokes: number
  calories: number
  spm: number | null
  pace: number | null
  power: number | null
  hr: number | null
  avgPace: number | null
  /** True when data arrived recently. */
  live: boolean
}

const round1 = (v: number) => Math.round(v * 10) / 10

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * Pure recording logic, independent of Bluetooth and React. All methods take `now` (ms) so
 * tests can drive time explicitly.
 */
export class SessionRecorder {
  id = newId()
  status: SessionStatus = 'idle'
  startedAt: number | null = null
  samples: Sample[] = []
  /** Data older than this is considered stale (link dropped). */
  staleAfterMs = 4000

  private live: RowerData = {}
  private lastDataAt = 0
  private linkUp = false
  private accumulatedMs = 0
  private resumedAt: number | null = null
  private armBaseline: { distance?: number; strokes?: number } = {}

  private distance = new CumulativeCounter()
  private strokes = new CumulativeCounter()
  private energy = new CumulativeCounter()

  // --- Input ------------------------------------------------------------------------------

  setLinkUp(up: boolean): void {
    this.linkUp = up
    if (!up) {
      // Instantaneous values are meaningless once the link is down.
      delete this.live.strokeRate
      delete this.live.instantPace
      delete this.live.instantPower
    }
  }

  ingest(data: RowerData, now: number): void {
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) (this.live as Record<string, number>)[k] = v
    }
    this.lastDataAt = now
    this.linkUp = true

    if (this.status === 'armed') {
      const b = this.armBaseline
      if (b.distance === undefined && data.totalDistance !== undefined) b.distance = data.totalDistance
      if (b.strokes === undefined && data.strokeCount !== undefined) b.strokes = data.strokeCount
      const moved =
        (data.totalDistance !== undefined && b.distance !== undefined && data.totalDistance > b.distance) ||
        (data.strokeCount !== undefined && b.strokes !== undefined && data.strokeCount > b.strokes)
      if (moved) this.start(now)
    }

    if (this.status === 'recording') {
      if (data.totalDistance !== undefined) this.distance.update(data.totalDistance)
      if (data.strokeCount !== undefined) this.strokes.update(data.strokeCount)
      if (data.totalEnergy !== undefined) this.energy.update(data.totalEnergy)
    }
  }

  // --- Controls ---------------------------------------------------------------------------

  /** Wait for the first stroke, then start automatically. */
  arm(): void {
    if (this.status !== 'idle') return
    this.status = 'armed'
    this.armBaseline = {}
  }

  start(now: number): void {
    if (this.status !== 'idle' && this.status !== 'armed') return
    this.distance = new CumulativeCounter()
    this.strokes = new CumulativeCounter()
    this.energy = new CumulativeCounter()
    // Count the first stroke that triggered the start.
    if (this.armBaseline.distance !== undefined) this.distance.begin(this.armBaseline.distance)
    if (this.armBaseline.strokes !== undefined) this.strokes.begin(this.armBaseline.strokes)
    this.status = 'recording'
    this.startedAt = now
    this.resumedAt = now
    this.accumulatedMs = 0
    this.samples = []
    this.tick(now)
  }

  pause(now: number): void {
    if (this.status !== 'recording') return
    this.tick(now)
    this.accumulatedMs += now - (this.resumedAt ?? now)
    this.resumedAt = null
    this.status = 'paused'
  }

  resume(now: number): void {
    if (this.status !== 'paused') return
    this.distance.rebase()
    this.strokes.rebase()
    this.energy.rebase()
    this.resumedAt = now
    this.status = 'recording'
  }

  finish(now: number): void {
    if (this.status === 'recording') this.pause(now)
    if (this.status === 'paused') this.status = 'finished'
  }

  // --- Time -------------------------------------------------------------------------------

  elapsedMs(now: number): number {
    const running = this.status === 'recording' && this.resumedAt !== null ? now - this.resumedAt : 0
    return this.accumulatedMs + running
  }

  isLive(now: number): boolean {
    return this.linkUp && now - this.lastDataAt < this.staleAfterMs
  }

  /**
   * Record one sample per elapsed second. If the timer was throttled (background tab), the
   * missing seconds are filled so the FIT file stays continuous.
   */
  tick(now: number): void {
    if (this.status !== 'recording') return
    const t = Math.floor(this.elapsedMs(now) / 1000)
    const lastT = this.samples.length ? this.samples[this.samples.length - 1].t : -1
    for (let s = lastT + 1; s <= t; s++) this.samples.push(this.sampleAt(s, now))
  }

  private sampleAt(t: number, now: number): Sample {
    const live = this.isLive(now)
    const L = this.live
    return {
      t,
      distance: round1(this.distance.value),
      strokes: Math.round(this.strokes.value),
      spm: live && L.strokeRate ? L.strokeRate : null,
      power: live ? Math.max(0, L.instantPower ?? 0) : null,
      pace: live && L.instantPace && L.instantPace < 1800 ? L.instantPace : null,
      hr: L.heartRate && L.heartRate > 0 && live ? L.heartRate : null,
      calories: Math.round(this.energy.value),
      connected: live,
    }
  }

  snapshot(now: number): LiveSnapshot {
    const live = this.isLive(now)
    const L = this.live
    const elapsedS = this.elapsedMs(now) / 1000
    const distance = this.distance.value
    return {
      status: this.status,
      elapsedS,
      distance,
      strokes: Math.round(this.strokes.value),
      calories: Math.round(this.energy.value),
      spm: live && L.strokeRate ? L.strokeRate : null,
      pace: live && L.instantPace && L.instantPace < 1800 ? L.instantPace : null,
      power: live && L.instantPower !== undefined ? Math.max(0, L.instantPower) : null,
      hr: live && L.heartRate ? L.heartRate : null,
      avgPace: distance > 10 ? (elapsedS / distance) * 500 : null,
      live,
    }
  }

  // --- Persistence ------------------------------------------------------------------------

  serialize(now: number): PersistedSession {
    return {
      id: this.id,
      status: this.status,
      startedAt: this.startedAt,
      elapsedMs: this.elapsedMs(now),
      samples: this.samples,
      counters: { distance: this.distance.value, strokes: this.strokes.value, energy: this.energy.value },
      savedAt: now,
    }
  }

  /** Restored sessions come back paused: the rower may have been idle since the crash. */
  static restore(state: PersistedSession): SessionRecorder {
    const r = new SessionRecorder()
    r.id = state.id
    r.startedAt = state.startedAt
    r.samples = state.samples
    r.accumulatedMs = state.elapsedMs
    r.distance = CumulativeCounter.fromValue(state.counters.distance)
    r.strokes = CumulativeCounter.fromValue(state.counters.strokes)
    r.energy = CumulativeCounter.fromValue(state.counters.energy)
    r.status = state.status === 'finished' ? 'finished' : 'paused'
    return r
  }

  hasContent(): boolean {
    return this.samples.length > 1 && this.distance.value > 0
  }

  toPayload(notes = ''): WorkoutCreate {
    if (this.startedAt === null || this.samples.length === 0) {
      throw new Error('Nothing recorded yet')
    }
    return {
      client_id: this.id,
      started_at: new Date(this.startedAt).toISOString(),
      notes,
      samples: this.samples,
    }
  }
}
