import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { PlanInfo } from '../api/types'
import { ConnectionBadge } from '../components/ConnectionBadge'
import { MetricChart } from '../components/MetricChart'
import { MetricTabs } from '../components/MetricTabs'
import { SessionBanner } from '../components/SessionBanner'
import { formatDuration, formatMetres, formatNumber, formatPace } from '../lib/format'
import type { MetricKey } from '../lib/metrics'
import { useSession } from '../session/SessionProvider'

export function LivePage() {
  const s = useSession()
  const navigate = useNavigate()
  const [metric, setMetric] = useState<MetricKey>('pace')
  const [confirming, setConfirming] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [plans, setPlans] = useState<PlanInfo[]>([])
  const dialogRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const savingRef = useRef(saving)
  savingRef.current = saving

  const { snapshot: snap, connection } = s
  const connected = connection.state === 'connected'
  const inWorkout = snap.status === 'recording' || snap.status === 'paused'

  useEffect(() => {
    api.plans().then(setPlans).catch(() => {})
  }, [])

  useEffect(() => {
    if (!confirming) return
    dialogRef.current?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (!savingRef.current) setConfirming(false)
        return
      }
      const dialog = dialogRef.current
      if (e.key !== 'Tab' || !dialog) return
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      openerRef.current?.focus()
    }
  }, [confirming])

  async function save() {
    setSaving(true)
    const result = await s.finish(notes)
    setSaving(false)
    setConfirming(false)
    setNotes('')
    if (result.workoutId) navigate(`/workouts/${result.workoutId}`)
    else if (result.queued) setMessage('Workout saved on this computer. It will be sent once the server is reachable.')
    else setMessage('Nothing was recorded, so there was nothing to save.')
  }

  return (
    <div className="live">
      {s.restorable && (
        <div className="notice" role="alert">
          <p>
            An unfinished workout from {new Date(s.restorable.savedAt).toLocaleTimeString()} was found
            ({formatMetres(s.restorable.counters.distance)} m, {formatDuration(s.restorable.elapsedMs / 1000)}).
          </p>
          <div className="notice-actions">
            <button className="btn btn-primary" onClick={s.restore}>Continue workout</button>
            <button className="btn" onClick={s.dismissRestorable}>Discard it</button>
          </div>
        </div>
      )}

      {s.outboxPending > 0 && (
        <div className="notice notice-quiet">
          <p>{s.outboxPending} workout{s.outboxPending > 1 ? 's' : ''} waiting to be sent to the server.</p>
          <button className="btn" onClick={s.syncNow}>Send now</button>
        </div>
      )}

      {message && (
        <div className="notice notice-quiet" role="status">
          <p>{message}</p>
          <button className="btn" onClick={() => setMessage(null)}>Dismiss</button>
        </div>
      )}

      <section className="connect-bar" aria-label="Rower connection">
        <div className="segmented" role="radiogroup" aria-label="Data source">
          <button
            role="radio"
            aria-checked={s.sourceKind === 'bluetooth'}
            className={s.sourceKind === 'bluetooth' ? 'is-active' : undefined}
            disabled={!s.bluetoothSupported || inWorkout}
            onClick={() => s.setSourceKind('bluetooth')}
          >
            WaterRower
          </button>
          <button
            role="radio"
            aria-checked={s.sourceKind === 'simulator'}
            className={s.sourceKind === 'simulator' ? 'is-active' : undefined}
            disabled={inWorkout}
            onClick={() => s.setSourceKind('simulator')}
          >
            Simulator
          </button>
        </div>
        <ConnectionBadge info={connection} />
        <div className="connect-actions">
          {connection.state === 'disconnected' ? (
            <button className="btn btn-primary" onClick={s.connect}>
              {s.sourceKind === 'bluetooth' ? 'Connect rower' : 'Start simulator'}
            </button>
          ) : connection.state === 'connecting' ? (
            <button className="btn btn-primary" disabled>
              Connecting…
            </button>
          ) : (
            <button className="btn" onClick={s.disconnect}>
              Disconnect
            </button>
          )}
        </div>
        {connection.error && (
          <p className="error" role="alert">
            {connection.error}
          </p>
        )}
        {!s.bluetoothSupported && (
          <p className="hint">
            This browser can't use Bluetooth. Open the app in Chrome or Edge on your laptop to connect the
            rower; the simulator works everywhere.
          </p>
        )}
      </section>

      {s.runner && s.plan && <SessionBanner state={s.runner} planName={s.plan.name} />}

      <section className="board" aria-label="Live workout data">
        <div className={`split ${inWorkout && !snap.live ? 'is-stale' : ''}`}>
          <span className="split-value">{formatPace(snap.pace)}</span>
          <span className="split-label" role="status" aria-live="polite">
            {inWorkout && !snap.live ? 'split per 500 m — signal lost, showing last reading' : 'split per 500 m'}
          </span>
        </div>

        <dl className="tiles">
          <div className="tile tile-time">
            <dt>Time</dt>
            <dd>{formatDuration(snap.elapsedS)}</dd>
          </div>
          <div className="tile">
            <dt>Distance</dt>
            <dd>{formatMetres(snap.distance)}<small>m</small></dd>
          </div>
          <div className="tile">
            <dt>Stroke rate</dt>
            <dd>{formatNumber(snap.spm)}<small>spm</small></dd>
          </div>
          <div className="tile">
            <dt>Power</dt>
            <dd>{formatNumber(snap.power)}<small>W</small></dd>
          </div>
          <div className="tile">
            <dt>Average split</dt>
            <dd>{formatPace(snap.avgPace)}</dd>
          </div>
          <div className="tile">
            <dt>Heart rate</dt>
            <dd>{formatNumber(snap.hr)}<small>bpm</small></dd>
          </div>
          <div className="tile">
            <dt>Strokes</dt>
            <dd>{snap.strokes}</dd>
          </div>
          <div className="tile">
            <dt>Calories</dt>
            <dd>{snap.calories}<small>kcal</small></dd>
          </div>
        </dl>
      </section>

      <section className="controls" aria-label="Workout controls">
        {snap.status === 'idle' || snap.status === 'finished' ? (
          <>
            <label className="select">
              <span>Session</span>
              <select
                value={s.plan?.id ?? ''}
                onChange={(e) =>
                  s.setPlan(plans.find((p) => p.id === Number(e.target.value)) ?? null)
                }
              >
                <option value="">Free row</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <button className="btn btn-primary btn-large" onClick={s.start} disabled={!connected}>
              Start workout
            </button>
            <p className="hint">
              {connected
                ? s.settings.startOnFirstStroke
                  ? 'The timer starts with your first stroke.'
                  : 'The timer starts immediately.'
                : 'Connect the rower first.'}
            </p>
          </>
        ) : snap.status === 'armed' ? (
          <>
            <p className="waiting" role="status" aria-live="polite">
              Waiting for your first stroke
            </p>
            <button className="btn" onClick={s.discard}>Cancel</button>
          </>
        ) : (
          <>
            {snap.status === 'recording' ? (
              <button className="btn btn-large" onClick={s.pause}>Pause</button>
            ) : (
              <button className="btn btn-primary btn-large" onClick={s.resume}>Resume</button>
            )}
            <button
              className="btn btn-large"
              onClick={(e) => {
                openerRef.current = e.currentTarget
                setConfirming(true)
              }}
            >
              Finish
            </button>
            {snap.status === 'paused' && (
              <button
                className="btn btn-danger controls-danger"
                onClick={() => {
                  if (confirm('Discard this workout? It will not be saved.')) void s.discard()
                }}
              >
                Discard
              </button>
            )}
          </>
        )}
      </section>

      <section className="panel" aria-label="Live chart">
        <div className="panel-head">
          <MetricTabs value={metric} onChange={setMetric} />
          <label className="select">
            <span>Show</span>
            <select
              value={s.settings.chartWindowS}
              onChange={(e) => s.updateSettings({ chartWindowS: Number(e.target.value) })}
            >
              <option value={120}>Last 2 minutes</option>
              <option value={300}>Last 5 minutes</option>
              <option value={900}>Last 15 minutes</option>
              <option value={0}>Whole workout</option>
            </select>
          </label>
        </div>
        {s.samples.length > 1 ? (
          <MetricChart
            samples={s.samples}
            metric={metric}
            windowS={s.settings.chartWindowS}
            version={s.version}
            height={240}
          />
        ) : (
          <p className="empty">The chart fills in as you row.</p>
        )}
      </section>

      {s.simulator && (
        <section className="panel simulator" aria-label="Simulator controls">
          <h2>Simulator</h2>
          <div className="sim-row">
            <button
              className="btn"
              aria-pressed={s.simulator.rowing}
              onClick={() => {
                s.simulator!.rowing = !s.simulator!.rowing
              }}
            >
              {s.simulator.rowing ? 'Stop rowing' : 'Start rowing'}
            </button>
            <button className="btn" onClick={() => s.simulator!.simulateDropout(8)}>
              Drop connection for 8 s
            </button>
            <button className="btn" onClick={() => s.simulator!.simulateDropout(6, true)}>
              Drop and reset monitor
            </button>
            <label className="select">
              <span>Target split</span>
              <input
                type="range"
                min={95}
                max={170}
                defaultValue={s.simulator.targetPace}
                onChange={(e) => {
                  s.simulator!.targetPace = Number(e.target.value)
                }}
              />
            </label>
          </div>
        </section>
      )}

      {confirming && (
        <div className="dialog-backdrop" role="presentation" onClick={() => !saving && setConfirming(false)}>
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="finish-title"
            ref={dialogRef}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="finish-title">Finish workout</h2>
            <p>
              {formatMetres(snap.distance)} m in {formatDuration(snap.elapsedS)}, average split{' '}
              {formatPace(snap.avgPace)}.
            </p>
            <label className="field">
              <span>Notes (optional)</span>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="How did it feel?"
              />
            </label>
            <div className="dialog-actions">
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving' : 'Save workout'}
              </button>
              <button className="btn" onClick={() => setConfirming(false)} disabled={saving}>
                Keep rowing
              </button>
            </div>
            {s.settings.autoStrava && <p className="hint">It will also be uploaded to Strava.</p>}
            {!s.settings.autoStrava && (
              <p className="hint">
                Automatic Strava upload is off. <Link to="/settings">Change in settings</Link>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
