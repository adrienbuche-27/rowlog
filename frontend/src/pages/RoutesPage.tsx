import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../api/client'
import type { RouteInfo } from '../api/types'
import { RouteCard } from '../components/RouteCard'

export function RoutesPage() {
  const [routes, setRoutes] = useState<RouteInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    api
      .routes()
      .then(setRoutes)
      .catch(() => setError("The server can't be reached. Start the backend, then reload this page."))
  }, [])

  async function deleteRoute(id: number) {
    setDeletingId(id)
    try {
      await api.deleteRoute(id)
      setRoutes((rs) => rs?.filter((r) => r.id !== id) ?? rs)
    } catch {
      setError("Couldn't delete this course. Try again.")
    } finally {
      setDeletingId(null)
    }
  }

  if (error && !routes) return <p className="error page-message">{error}</p>
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

      {error && <p className="error">{error}</p>}

      <div className="routes-grid">
        {routes.map((r) => (
          <RouteCard key={r.id} route={r} onDelete={deleteRoute} deleting={deletingId === r.id} />
        ))}
        <AddRouteCard
          onAdded={(route) => {
            setRoutes((rs) => [...(rs ?? []), route])
            setError(null)
          }}
          onError={setError}
        />
      </div>
    </div>
  )
}

function AddRouteCard({
  onAdded,
  onError,
}: {
  onAdded: (route: RouteInfo) => void
  onError: (message: string) => void
}) {
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !file) return
    setBusy(true)
    try {
      const route = await api.createRoute(name.trim(), file)
      onAdded(route)
      setName('')
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Couldn't add this course.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="panel route-card route-card-add">
      <h2>Add a course</h2>
      <p className="hint">Name it, then upload a GPX file to trace its route.</p>
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span className="visually-hidden">Course name</span>
          <input
            type="text"
            placeholder="Course name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
          />
        </label>
        <label className="field">
          <span className="visually-hidden">GPX file</span>
          <input
            ref={fileInput}
            type="file"
            accept=".gpx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button className="btn" type="submit" disabled={busy || !name.trim() || !file}>
          {busy ? 'Adding…' : 'Add course'}
        </button>
      </form>
    </article>
  )
}
