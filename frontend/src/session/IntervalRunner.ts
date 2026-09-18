import type { PlanPiece, RowedPiece } from '../api/types'

export type RunnerPhase = 'piece' | 'rest' | 'done'

export interface RunnerState {
  phase: RunnerPhase
  /** 1-based: the piece being rowed, or the one waiting at the end of a rest. */
  pieceNumber: number
  totalPieces: number
  piece: PlanPiece | null
  /** 0..1 through the current piece. */
  progress: number
  /** Left in the current piece: metres for a distance piece, seconds for a time piece. */
  remaining: number
  /** Seconds left of the current rest. */
  restRemaining: number
  /** The piece that starts when the rest ends. */
  next: PlanPiece | null
}

/**
 * Drives a training session: tracks the current piece, auto-advances to a timed rest when it
 * is done, then starts the next one. Pure and time-injected like SessionRecorder — it is fed
 * the recorder's elapsed time and distance and holds no timers of its own.
 *
 * A piece's `end_t` is the moment the runner *noticed* it finish, so it lags by up to one
 * tick. Per-piece stats are recomputed from the samples on the backend, which is exact.
 */
export class IntervalRunner {
  private index = 0
  private phase: RunnerPhase = 'piece'
  private pieceStartT = 0
  private pieceStartD = 0
  private restUntilT = 0
  private rowed: RowedPiece[] = []
  private cursor = 0
  private lastT = 0
  private lastD = 0

  constructor(private pieces: PlanPiece[]) {
    if (pieces.length === 0) this.phase = 'done'
  }

  /** Advance the machine to `elapsedS`/`distance` and report what to show. */
  update(elapsedS: number, distance: number): RunnerState {
    // Crossing more than one boundary in a single step is possible (see `consume`), so
    // keep advancing until the machine settles.
    for (let guard = 0; guard < 1000 && this.advance(elapsedS, distance); guard++) {
      /* advance() reports whether anything changed */
    }
    return this.state(elapsedS, distance)
  }

  /**
   * Step through the recorder's per-second samples, picking up where the last call left off.
   *
   * Driving the runner from samples rather than the live snapshot is what keeps piece
   * boundaries right when Chrome throttles a hidden tab: `SessionRecorder.tick` back-fills
   * the missing seconds, so a distance piece still ends at the second the metres were
   * actually reached instead of wherever the rower had got to by the time the tab woke up.
   */
  consume(samples: { t: number; distance: number }[]): RunnerState {
    let state = this.state(this.lastT, this.lastD)
    for (; this.cursor < samples.length; this.cursor++) {
      const { t, distance } = samples[this.cursor]
      this.lastT = t
      this.lastD = distance
      state = this.update(t, distance)
    }
    return state
  }

  private advance(elapsedS: number, distance: number): boolean {
    if (this.phase === 'done') return false

    if (this.phase === 'rest') {
      if (elapsedS < this.restUntilT) return false
      this.index += 1
      this.phase = 'piece'
      this.pieceStartT = this.restUntilT
      this.pieceStartD = distance
      return true
    }

    const piece = this.pieces[this.index]
    const done =
      piece.kind === 'distance'
        ? distance - this.pieceStartD >= piece.target
        : elapsedS - this.pieceStartT >= piece.target

    if (!done) return false

    // A time piece ends exactly on its target; a distance one when we saw it crossed.
    const endT = piece.kind === 'time' ? this.pieceStartT + piece.target : elapsedS
    this.rowed.push({
      index: this.index + 1,
      kind: piece.kind,
      target: piece.target,
      start_t: this.pieceStartT,
      end_t: endT,
    })

    if (this.index >= this.pieces.length - 1) {
      this.phase = 'done'
      return false
    }
    if (piece.rest_s > 0) {
      this.phase = 'rest'
      this.restUntilT = endT + piece.rest_s
      return true
    }
    this.index += 1
    this.pieceStartT = endT
    this.pieceStartD = distance
    return true
  }

  private state(elapsedS: number, distance: number): RunnerState {
    const total = this.pieces.length
    if (this.phase === 'done') {
      return {
        phase: 'done', pieceNumber: total, totalPieces: total, piece: null,
        progress: 1, remaining: 0, restRemaining: 0, next: null,
      }
    }

    if (this.phase === 'rest') {
      const next = this.pieces[this.index + 1] ?? null
      return {
        phase: 'rest',
        pieceNumber: this.index + 2,
        totalPieces: total,
        piece: next,
        progress: 0,
        remaining: next ? next.target : 0,
        restRemaining: Math.max(0, this.restUntilT - elapsedS),
        next,
      }
    }

    const piece = this.pieces[this.index]
    const covered = piece.kind === 'distance' ? distance - this.pieceStartD : elapsedS - this.pieceStartT
    return {
      phase: 'piece',
      pieceNumber: this.index + 1,
      totalPieces: total,
      piece,
      progress: Math.min(1, Math.max(0, covered / piece.target)),
      remaining: Math.max(0, piece.target - covered),
      restRemaining: 0,
      next: this.pieces[this.index + 1] ?? null,
    }
  }

  /** Pieces finished so far, for the saved workout. */
  get rowedPieces(): RowedPiece[] {
    return this.rowed
  }

  get isDone(): boolean {
    return this.phase === 'done'
  }
}
