import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type uPlot from 'uplot'
import { api } from '../api/client'
import type { StatsOverview, WorkoutSummary } from '../api/types'
import { UPlotChart } from '../components/UPlotChart'
import { formatDate, formatDuration, formatKm, formatMetres, formatNumber, formatPace } from '../lib/format'
import { cssVar } from '../lib/metrics'

export function HistoryPage() {
  const [stats, setStats] = useState<StatsOverview | null>(null)
  const [workouts, setWorkouts] = useState<WorkoutSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.stats(), api.listWorkouts()])
      .then(([st, ws]) => {
        setStats(st)
        setWorkouts(ws)
      })
      .catch(() => setError("The server can't be reached. Start the backend, then reload this page."))
  }, [])

  if (error) return <p className="error page-message">{error}</p>
  if (!stats || !workouts) return <p className="page-message">Loading history</p>
  if (workouts.length === 0) {
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
    <div className="history">
      <header className="page-head">
        <h1>History</h1>
        <dl className="totals">
          <div><dt>Total distance</dt><dd>{formatKm(stats.total_distance_m)}</dd></div>
          <div><dt>Time rowed</dt><dd>{formatDuration(stats.total_duration_s)}</dd></div>
          <div><dt>Workouts</dt><dd>{stats.total_workouts}</dd></div>
        </dl>
      </header>

      <div className="history-grid">
        <section className="panel">
          <h2>Distance per week, in km</h2>
          <WeeklyBars weeks={stats.weekly} />
        </section>

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

      <section className="panel">
        <h2>Workouts</h2>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th><th>Distance</th><th>Time</th><th>Split</th>
                <th>Rate</th><th>Power</th><th>Strava</th>
              </tr>
            </thead>
            <tbody>
              {workouts.map((w) => (
                <tr key={w.id}>
                  <td><Link to={`/workouts/${w.id}`}>{formatDate(w.started_at)}</Link></td>
                  <td className="num">{formatMetres(w.distance_m)} m</td>
                  <td className="num">{formatDuration(w.duration_s)}</td>
                  <td className="num">{formatPace(w.avg_split_s)}</td>
                  <td className="num">{formatNumber(w.avg_spm)}</td>
                  <td className="num">{formatNumber(w.avg_power_w)} W</td>
                  <td>{STRAVA_LABELS[w.strava_status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

const STRAVA_LABELS = { none: '', processing: 'Uploading', done: 'Uploaded', error: 'Failed' }

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
