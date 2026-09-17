import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import type { RouteInfo, WorkoutDetail } from '../api/types'
import { MetricChart } from '../components/MetricChart'
import { MetricTabs } from '../components/MetricTabs'
import { formatDateTime, formatDuration, formatMetres, formatNumber, formatPace } from '../lib/format'
import type { MetricKey } from '../lib/metrics'

export function WorkoutPage() {
  const { id } = useParams()
  const workoutId = Number(id)
  const navigate = useNavigate()
  const [workout, setWorkout] = useState<WorkoutDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [metric, setMetric] = useState<MetricKey>('pace')
  const [notes, setNotes] = useState('')
  const [notesSaved, setNotesSaved] = useState(true)
  const [stravaBusy, setStravaBusy] = useState(false)
  const [routes, setRoutes] = useState<RouteInfo[]>([])
  const [routeBusy, setRouteBusy] = useState(false)

  useEffect(() => {
    api
      .getWorkout(workoutId)
      .then((w) => {
        setWorkout(w)
        setNotes(w.notes)
      })
      .catch((e) => setError(e.status === 404 ? 'This workout no longer exists.' : "The server can't be reached."))
    api.routes().then(setRoutes).catch(() => setRoutes([]))
  }, [workoutId])

  // Poll while Strava processes the upload.
  const stravaStatus = workout?.strava_status
  useEffect(() => {
    if (stravaStatus !== 'processing') return
    const timer = setInterval(async () => {
      try {
        const updated = await api.refreshStrava(workoutId)
        setWorkout((w) => (w ? { ...w, ...updated } : w))
      } catch {
        /* keep polling */
      }
    }, 2500)
    return () => clearInterval(timer)
  }, [stravaStatus, workoutId])

  if (error) return <p className="error page-message">{error} <Link to="/history">Back to history</Link></p>
  if (!workout) return <p className="page-message">Loading workout</p>

  const hasHr = workout.samples.some((s) => s.hr)

  async function uploadToStrava() {
    setStravaBusy(true)
    try {
      const updated = await api.uploadToStrava(workoutId)
      setWorkout((w) => (w ? { ...w, ...updated } : w))
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setWorkout((w) => (w ? { ...w, strava_status: 'error', strava_error: message } : w))
    } finally {
      setStravaBusy(false)
    }
  }

  async function saveNotes() {
    await api.updateNotes(workoutId, notes)
    setNotesSaved(true)
  }

  async function changeRoute(routeId: string) {
    setRouteBusy(true)
    try {
      const updated = await api.updateRoute(workoutId, routeId ? Number(routeId) : null)
      setWorkout((w) => (w ? { ...w, ...updated } : w))
    } finally {
      setRouteBusy(false)
    }
  }

  async function remove() {
    if (!confirm('Delete this workout? This cannot be undone. Activities already on Strava stay there.')) return
    await api.deleteWorkout(workoutId)
    navigate('/history')
  }

  return (
    <div className="workout">
      <header className="page-head">
        <p className="back"><Link to="/history">History</Link></p>
        <h1>{formatDateTime(workout.started_at)}</h1>
        <dl className="totals">
          <div><dt>Distance</dt><dd>{formatMetres(workout.distance_m)} m</dd></div>
          <div><dt>Time</dt><dd>{formatDuration(workout.duration_s)}</dd></div>
          <div><dt>Average split</dt><dd>{formatPace(workout.avg_split_s)}</dd></div>
          <div><dt>Stroke rate</dt><dd>{formatNumber(workout.avg_spm)} spm</dd></div>
          <div><dt>Power</dt><dd>{formatNumber(workout.avg_power_w)} W</dd></div>
          {workout.avg_hr && <div><dt>Heart rate</dt><dd>{formatNumber(workout.avg_hr)} bpm</dd></div>}
          <div><dt>Calories</dt><dd>{workout.calories} kcal</dd></div>
        </dl>
        {workout.disconnect_s > 0 && (
          <p className="hint">
            The rower was disconnected for {formatDuration(workout.disconnect_s)} during this workout. Distance
            was kept; live values are missing for that period.
          </p>
        )}
      </header>

      <section className="panel">
        <div className="panel-head">
          <MetricTabs
            value={metric}
            onChange={setMetric}
            available={hasHr ? ['pace', 'power', 'spm', 'hr'] : ['pace', 'power', 'spm']}
          />
        </div>
        <MetricChart samples={workout.samples} metric={metric} height={280} />
      </section>

      <div className="workout-grid">
        <section className="panel">
          <h2>Splits every 500 m</h2>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr><th>#</th><th>Distance</th><th>Time</th><th>Split</th><th>Rate</th><th>Power</th></tr>
              </thead>
              <tbody>
                {workout.splits.map((sp) => (
                  <tr key={sp.index}>
                    <td className="num">{sp.index}</td>
                    <td className="num">{formatMetres(sp.distance_m)} m</td>
                    <td className="num">{formatDuration(sp.time_s)}</td>
                    <td className="num">{formatPace(sp.split_s)}</td>
                    <td className="num">{formatNumber(sp.avg_spm)}</td>
                    <td className="num">{formatNumber(sp.avg_power_w)} W</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="stack">
          <section className="panel">
            <h2>Export</h2>
            <label className="field">
              <span>Row it somewhere</span>
              <select
                value={workout.route_id ?? ''}
                disabled={routeBusy}
                onChange={(e) => changeRoute(e.target.value)}
              >
                <option value="">No location (indoor)</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.location ? `${r.name} — ${r.location}` : r.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint">
              Adds a virtual GPS track along the chosen course to the FIT file, so Strava and Garmin Connect
              show a map for this row.
            </p>
            <div className="stack-actions">
              <a className="btn" href={api.fitUrl(workoutId)} download>
                Download FIT file
              </a>
              <StravaAction workout={workout} busy={stravaBusy} onUpload={uploadToStrava} />
            </div>
            <p className="hint">Import the FIT file in Garmin Connect under Import data.</p>
          </section>

          <section className="panel">
            <h2>Notes</h2>
            <label className="field">
              <span className="visually-hidden">Workout notes</span>
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value)
                  setNotesSaved(false)
                }}
              />
            </label>
            <div className="stack-actions">
              <button className="btn" onClick={saveNotes} disabled={notesSaved}>
                {notesSaved ? 'Notes saved' : 'Save notes'}
              </button>
              <button className="btn btn-danger" onClick={remove}>
                Delete workout
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function StravaAction({
  workout,
  busy,
  onUpload,
}: {
  workout: WorkoutDetail
  busy: boolean
  onUpload: () => void
}) {
  switch (workout.strava_status) {
    case 'done':
      return (
        <a
          className="btn"
          href={`https://www.strava.com/activities/${workout.strava_activity_id}`}
          target="_blank"
          rel="noreferrer"
        >
          View on Strava
        </a>
      )
    case 'processing':
      return <span className="hint">Strava is processing the upload</span>
    case 'error':
      return (
        <div>
          <button className="btn" onClick={onUpload} disabled={busy}>Upload to Strava again</button>
          <p className="error">{workout.strava_error}</p>
        </div>
      )
    default:
      return (
        <button className="btn btn-strava" onClick={onUpload} disabled={busy}>
          {busy ? 'Uploading' : 'Upload to Strava'}
        </button>
      )
  }
}
