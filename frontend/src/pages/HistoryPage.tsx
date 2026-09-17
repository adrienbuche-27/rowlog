import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type uPlot from 'uplot'
import { api } from '../api/client'
import type { StatsOverview, WorkoutSummary } from '../api/types'
import { UPlotChart } from '../components/UPlotChart'
import { WorkoutDetail } from '../components/WorkoutDetail'
import { formatDate, formatDuration, formatKm, formatMetres, formatPace } from '../lib/format'
import { cssVar } from '../lib/metrics'

/**
 * Master-detail workspace: the workout list stays put on the left while the pane on the
 * right shows either all-time stats or whichever workout is open (/workouts/:id).
 */
export function HistoryPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const selectedId = id ? Number(id) : null

  const [stats, setStats] = useState<StatsOverview | null>(null)
  const [workouts, setWorkouts] = useState<WorkoutSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    () =>
      Promise.all([api.stats(), api.listWorkouts()]).then(([st, ws]) => {
        setStats(st)
        setWorkouts(ws)
      }),
    [],
  )

  useEffect(() => {
    load().catch(() => setError("The server can't be reached. Start the backend, then reload this page."))
  }, [load])

  if (error) return <p className="error page-message">{error}</p>
  if (!stats || !workouts) return <p className="page-message">Loading history</p>

  return (
    <div className={`workspace ${selectedId ? 'has-selection' : ''}`}>
      <div className="workspace-list">
        <div className="workspace-list-head">
          <h1>History</h1>
          <p className="hint">{stats.total_workouts} workouts · {formatKm(stats.total_distance_m)}</p>
        </div>

        <Link to="/history" className={`list-item list-item-overview ${selectedId ? '' : 'is-active'}`}>
          <span className="list-item-title">All-time summary</span>
          <span className="list-item-meta">Volume, trend and best times</span>
        </Link>

        {workouts.length === 0 ? (
          <p className="empty">
            No workouts yet. <Link to="/">Start one</Link>
          </p>
        ) : (
          workouts.map((w) => (
            <Link
              key={w.id}
              to={`/workouts/${w.id}`}
              className={`list-item ${w.id === selectedId ? 'is-active' : ''}`}
            >
              <span className="list-item-title">{formatDate(w.started_at)}</span>
              <span className="list-item-meta">
                <span className="num">{formatMetres(w.distance_m)} m</span>
                <span className="num">{formatDuration(w.duration_s)}</span>
                <span className="num">{formatPace(w.avg_split_s)}</span>
              </span>
            </Link>
          ))
        )}
      </div>

      <div className="workspace-detail">
        {selectedId ? (
          <WorkoutDetail
            key={selectedId}
            workoutId={selectedId}
            onDeleted={() => {
              load()
              navigate('/history')
            }}
          />
        ) : (
          <Overview stats={stats} hasWorkouts={workouts.length > 0} />
        )}
      </div>
    </div>
  )
}

function Overview({ stats, hasWorkouts }: { stats: StatsOverview; hasWorkouts: boolean }) {
  if (!hasWorkouts) {
    return (
      <div className="page-message">
        <h1>No workouts yet</h1>
        <p>
          Finished workouts appear here with your weekly volume, split trend and best times.{' '}
          <Link to="/">Start a workout</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="overview">
      <header className="page-head">
        <h1>All-time summary</h1>
        <dl className="totals">
          <div><dt>Total distance</dt><dd>{formatKm(stats.total_distance_m)}</dd></div>
          <div><dt>Time rowed</dt><dd>{formatDuration(stats.total_duration_s)}</dd></div>
          <div><dt>Workouts</dt><dd>{stats.total_workouts}</dd></div>
        </dl>
      </header>

      <section className="panel">
        <h2>Distance per week, in km</h2>
        <WeeklyBars weeks={stats.weekly} />
      </section>

      <div className="overview-grid">
        <section className="panel">
          <h2>Average split per workout</h2>
          {stats.split_trend.length > 1 ? (
            <SplitTrend points={stats.split_trend} />
          ) : (
            <p className="empty">The trend appears after two workouts of 1 km or more.</p>
          )}
        </section>

        <section className="panel">
          <h2>Best times</h2>
          {stats.personal_bests.length ? (
            <table className="table">
              <thead>
                <tr><th>Distance</th><th>Time</th><th>Split</th><th>Date</th></tr>
              </thead>
              <tbody>
                {stats.personal_bests.map((pb) => (
                  <tr key={pb.distance_m}>
                    <td>{formatMetres(pb.distance_m)} m</td>
                    <td className="num">{formatDuration(pb.time_s)}</td>
                    <td className="num">{formatPace(pb.split_s)}</td>
                    <td><Link to={`/workouts/${pb.workout_id}`}>{formatDate(pb.date)}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty">Row at least 500 m to set your first best time.</p>
          )}
        </section>
      </div>
    </div>
  )
}

function WeeklyBars({ weeks }: { weeks: StatsOverview['weekly'] }) {
  const max = Math.max(...weeks.map((w) => w.distance_m), 1)
  return (
    <div className="bars" role="img" aria-label="Distance rowed each week">
      {weeks.map((w) => (
        <div key={w.week_start} className="bar" title={`${formatKm(w.distance_m)}, ${w.workouts} workouts`}>
          <span className="bar-value">
            {w.distance_m ? (w.distance_m / 1000).toFixed(w.distance_m < 10000 ? 1 : 0) : ''}
          </span>
          <span className="bar-fill" style={{ height: `${(w.distance_m / max) * 100}%` }} />
          <span className="bar-label">
            {new Date(w.week_start).toLocaleDateString(undefined, { day: 'numeric', month: 'numeric' })}
          </span>
        </div>
      ))}
    </div>
  )
}

function SplitTrend({ points }: { points: StatsOverview['split_trend'] }) {
  const data = useMemo<uPlot.AlignedData>(
    () => [points.map((p) => new Date(p.date).getTime() / 1000), points.map((p) => p.avg_split_s)],
    [points],
  )
  const options = useMemo<Omit<uPlot.Options, 'width' | 'height'>>(() => {
    const axis = { stroke: cssVar('--mist'), grid: { stroke: cssVar('--line') }, ticks: { stroke: cssVar('--line') } }
    return {
      legend: { show: false },
      scales: { y: { dir: -1 } },
      axes: [axis, { ...axis, size: 60, values: (_u, vals) => vals.map((v) => formatPace(v)) }],
      series: [
        {},
        { stroke: cssVar('--water'), width: 2, points: { show: true, size: 6, fill: cssVar('--water') } },
      ],
    }
  }, [])
  return <UPlotChart options={options} data={data} height={200} optionsKey="trend" ariaLabel="Average split trend" />
}
