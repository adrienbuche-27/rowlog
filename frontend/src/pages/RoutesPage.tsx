import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { RouteInfo } from '../api/types'
import { RouteCard } from '../components/RouteCard'

export function RoutesPage() {
  const [routes, setRoutes] = useState<RouteInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

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

      <div className="routes-grid">
        {routes.map((r) => (
          <RouteCard key={r.id} route={r} />
        ))}
      </div>
    </div>
  )
}
