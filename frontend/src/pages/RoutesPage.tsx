import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { RouteInfo } from '../api/types'
import { RouteMap } from '../components/RouteMap'
import { formatMetres } from '../lib/format'

export function RoutesPage() {
  const [routes, setRoutes] = useState<RouteInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    api
      .routes()
      .then(setRoutes)
      .catch(() => setError("The server can't be reached. Start the backend, then reload this page."))
  }, [])

  if (error) return <p className="error page-message">{error}</p>
  if (!routes) return <p className="page-message">Loading courses</p>

  return (
    <div className="routes">
      <header className="page-head">
        <h1>Rowing courses</h1>
        <p className="hint">
          Pick one on a workout's page to add a virtual GPS track to its FIT file, so Strava and Garmin
          Connect show a map even though the row was indoor.
        </p>
      </header>

      <section className="panel">
        <RouteMap routes={routes} selectedId={selected} />
      </section>

      <section className="panel">
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr><th>Course</th><th>Location</th><th>Length</th></tr>
            </thead>
            <tbody>
              {routes.map((r) => (
                <tr
                  key={r.id}
                  className={r.id === selected ? 'is-active' : undefined}
                  onMouseEnter={() => setSelected(r.id)}
                  onMouseLeave={() => setSelected(null)}
                >
                  <td>{r.name}</td>
                  <td>{r.location}</td>
                  <td className="num">{formatMetres(r.length_m)} m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
