import { useEffect, useState } from 'react'
import { ApiError, api } from '../api/client'
import type { PieceKind, PlanInfo, PlanPiece } from '../api/types'
import { formatDuration, formatMetres } from '../lib/format'

const describe = (piece: PlanPiece) =>
  piece.kind === 'distance' ? `${formatMetres(piece.target)} m` : formatDuration(piece.target)

/** Total metres/seconds a plan asks for, for the card summary. */
function summarise(pieces: PlanPiece[]): string {
  const metres = pieces.filter((p) => p.kind === 'distance').reduce((sum, p) => sum + p.target, 0)
  const seconds = pieces.reduce(
    (sum, p, i) => sum + (p.kind === 'time' ? p.target : 0) + (i < pieces.length - 1 ? p.rest_s : 0),
    0,
  )
  const parts = []
  if (metres) parts.push(`${formatMetres(metres)} m`)
  if (seconds) parts.push(formatDuration(seconds))
  return parts.join(' + ') || '—'
}

export function PlansPage() {
  const [plans, setPlans] = useState<PlanInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    api
      .plans()
      .then(setPlans)
      .catch(() => setError("The server can't be reached. Start the backend, then reload this page."))
  }, [])

  async function remove(plan: PlanInfo) {
    if (!confirm(`Delete "${plan.name}"? Past workouts keep the pieces they rowed.`)) return
    setDeletingId(plan.id)
    try {
      await api.deletePlan(plan.id)
      setPlans((ps) => ps?.filter((p) => p.id !== plan.id) ?? ps)
    } catch {
      setError("Couldn't delete this session. Try again.")
    } finally {
      setDeletingId(null)
    }
  }

  if (error && !plans) return <p className="error page-message">{error}</p>
  if (!plans) return <p className="page-message">Loading sessions</p>

  return (
    <div className="plans">
      <header className="page-head">
        <h1>Training sessions</h1>
        <p className="hint">
          Build a session once, then pick it on the Row page. The app counts each piece, rests for
          you and starts the next one by itself.
        </p>
      </header>

      {error && <p className="error">{error}</p>}

      <div className="routes-grid">
        {plans.map((plan) => (
          <article key={plan.id} className="panel plan-card">
            <h2>{plan.name}</h2>
            <p className="hint">{plan.pieces.length} pieces · {summarise(plan.pieces)}</p>
            <ol className="plan-pieces">
              {plan.pieces.map((piece, i) => (
                <li key={i}>
                  <span className="num">{describe(piece)}</span>
                  {i < plan.pieces.length - 1 && piece.rest_s > 0 && (
                    <span className="plan-rest">rest {formatDuration(piece.rest_s)}</span>
                  )}
                </li>
              ))}
            </ol>
            <button
              className="btn btn-danger route-card-delete"
              onClick={() => remove(plan)}
              disabled={deletingId === plan.id}
            >
              {deletingId === plan.id ? 'Deleting…' : 'Delete'}
            </button>
          </article>
        ))}
        <AddPlanCard
          onAdded={(plan) => {
            setPlans((ps) => [...(ps ?? []), plan])
            setError(null)
          }}
          onError={setError}
        />
      </div>
    </div>
  )
}

const emptyPiece = (): PlanPiece => ({ kind: 'distance', target: 500, rest_s: 60 })

function AddPlanCard({
  onAdded,
  onError,
}: {
  onAdded: (plan: PlanInfo) => void
  onError: (message: string) => void
}) {
  const [name, setName] = useState('')
  const [pieces, setPieces] = useState<PlanPiece[]>([emptyPiece()])
  const [busy, setBusy] = useState(false)

  function patch(index: number, change: Partial<PlanPiece>) {
    setPieces((ps) => ps.map((p, i) => (i === index ? { ...p, ...change } : p)))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || pieces.some((p) => p.target <= 0)) return
    setBusy(true)
    try {
      const plan = await api.createPlan({ name: name.trim(), pieces })
      onAdded(plan)
      setName('')
      setPieces([emptyPiece()])
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Couldn't save this session.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="panel route-card route-card-add plan-card-add">
      <h2>Build a session</h2>
      <form onSubmit={submit}>
        <label className="field">
          <span className="visually-hidden">Session name</span>
          <input
            type="text"
            placeholder="Session name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
          />
        </label>

        {pieces.map((piece, i) => (
          <div key={i} className="plan-editor-row">
            <select
              aria-label={`Piece ${i + 1} type`}
              value={piece.kind}
              onChange={(e) => patch(i, { kind: e.target.value as PieceKind })}
            >
              <option value="distance">Distance (m)</option>
              <option value="time">Time (s)</option>
            </select>
            <input
              type="number"
              aria-label={`Piece ${i + 1} target`}
              min={1}
              value={piece.target}
              onChange={(e) => patch(i, { target: Number(e.target.value) })}
            />
            <input
              type="number"
              aria-label={`Piece ${i + 1} rest in seconds`}
              min={0}
              value={piece.rest_s}
              onChange={(e) => patch(i, { rest_s: Number(e.target.value) })}
              title="Rest after this piece, in seconds"
            />
            <button
              type="button"
              className="btn plan-editor-remove"
              onClick={() => setPieces((ps) => ps.filter((_, n) => n !== i))}
              disabled={pieces.length === 1}
              aria-label={`Remove piece ${i + 1}`}
            >
              ×
            </button>
          </div>
        ))}
        <p className="hint">Target, then rest in seconds. Rest after the last piece is ignored.</p>

        <div className="stack-actions">
          <button type="button" className="btn" onClick={() => setPieces((ps) => [...ps, emptyPiece()])}>
            Add piece
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : 'Save session'}
          </button>
        </div>
      </form>
    </article>
  )
}
