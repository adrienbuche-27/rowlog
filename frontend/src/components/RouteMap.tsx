import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import type { RouteInfo } from '../api/types'
import { formatMetres } from '../lib/format'

interface Props {
  routes: RouteInfo[]
  /** Route to highlight and pan to; shows all routes if omitted. */
  selectedId?: string | null
  height?: number
}

const COLORS = ['#5cc9c1', '#e8b84b', '#e07a5f', '#9d8df1', '#7fb069']

export function RouteMap({ routes, selectedId, height = 420 }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layers = useRef<L.Layer[]>([])

  useEffect(() => {
    const el = host.current
    if (!el) return
    const m = L.map(el, { scrollWheelZoom: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(m)
    map.current = m
    return () => {
      m.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m || routes.length === 0) return

    for (const layer of layers.current) layer.remove()
    layers.current = []

    const bounds = L.latLngBounds([])
    routes.forEach((route, i) => {
      const isSelected = selectedId ? route.id === selectedId : true
      const color = COLORS[i % COLORS.length]
      const line = L.polyline(route.waypoints, {
        color,
        weight: isSelected ? 4 : 2,
        opacity: isSelected ? 0.95 : 0.35,
      })
        .bindTooltip(`${route.name} — ${formatMetres(route.length_m)} m`)
        .addTo(m)
      layers.current.push(line)

      const start = L.circleMarker(route.waypoints[0], {
        radius: 5,
        color,
        fillColor: color,
        fillOpacity: 1,
      }).addTo(m)
      layers.current.push(start)

      if (!selectedId || isSelected) bounds.extend(line.getBounds())
    })

    if (bounds.isValid()) m.fitBounds(bounds, { padding: [32, 32] })
  }, [routes, selectedId])

  return <div ref={host} style={{ height }} className="route-map" role="img" aria-label="Rowing course map" />
}
