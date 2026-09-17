import type { RouteInfo } from '../api/types'
import { formatMetres } from '../lib/format'
import { RouteMap } from './RouteMap'

interface Props {
  route: RouteInfo
  onDelete: (id: number) => void
  deleting?: boolean
}

export function RouteCard({ route, onDelete, deleting = false }: Props) {
  function remove() {
    if (!confirm(`Delete "${route.name}"? Workouts using it will lose this course.`)) return
    onDelete(route.id)
  }

  return (
    <article className="panel route-card">
      <RouteMap routes={[route]} height={160} interactive={false} />
      <h2>{route.name}</h2>
      {route.location && <p className="hint">{route.location}</p>}
      <p className="route-card-length">{formatMetres(route.length_m)} m</p>
      <button className="btn btn-danger route-card-delete" onClick={remove} disabled={deleting}>
        {deleting ? 'Deleting…' : 'Delete'}
      </button>
    </article>
  )
}
