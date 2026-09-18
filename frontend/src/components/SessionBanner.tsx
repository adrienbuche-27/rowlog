import type { PlanPiece } from '../api/types'
import type { RunnerState } from '../session/IntervalRunner'
import { formatDuration, formatMetres } from '../lib/format'

const describe = (piece: PlanPiece) =>
  piece.kind === 'distance' ? `${formatMetres(piece.target)} m` : formatDuration(piece.target)

/** Where you are in a training session, shown above the split while rowing. */
export function SessionBanner({ state, planName }: { state: RunnerState; planName: string }) {
  if (state.phase === 'done') {
    return (
      <section className="session-banner is-done" aria-live="polite">
        <p className="session-banner-head">{planName}</p>
        <p className="session-banner-value">Session complete</p>
        <p className="hint">Press Finish when you have cooled down.</p>
      </section>
    )
  }

  if (state.phase === 'rest') {
    return (
      <section className="session-banner is-rest" aria-live="polite">
        <p className="session-banner-head">
          Rest · next up piece {state.pieceNumber} of {state.totalPieces}
        </p>
        <p className="session-banner-value">{formatDuration(state.restRemaining)}</p>
        <p className="hint">{state.next ? `Then ${describe(state.next)}` : ''}</p>
      </section>
    )
  }

  const piece = state.piece
  if (!piece) return null
  return (
    <section className="session-banner" aria-live="polite">
      <p className="session-banner-head">
        Piece {state.pieceNumber} of {state.totalPieces} · {describe(piece)}
      </p>
      <p className="session-banner-value">
        {piece.kind === 'distance'
          ? `${formatMetres(state.remaining)} m`
          : formatDuration(state.remaining)}
        <small>to go</small>
      </p>
      <div className="session-progress" role="progressbar" aria-valuenow={Math.round(state.progress * 100)}
        aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${state.progress * 100}%` }} />
      </div>
    </section>
  )
}
