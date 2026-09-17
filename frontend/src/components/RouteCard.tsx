import type { RouteInfo } from '../api/types'
import { formatMetres } from '../lib/format'
import { RouteMap } from './RouteMap'

export function RouteCard({ route }: { route: RouteInfo }) {
  return (
    <article className="panel route-card">
      <RouteMap routes={[route]} height={160} interactive={false} />
      <h2>{route.name}</h2>
      <p className="hint">{route.location}</p>
      <p className="route-card-length">{formatMetres(route.length_m)} m</p>
    </article>
  )
}
