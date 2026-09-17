const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/** 123.4 → "2:03.4" */
export function formatPace(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '–:––'
  const tenths = Math.round(seconds * 10)
  const m = Math.floor(tenths / 600)
  const s = Math.floor((tenths % 600) / 10)
  return `${m}:${pad(s)}.${tenths % 10}`
}

/** 754 → "12:34", 3754 → "1:02:34" */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** 5234.6 → "5 235" (metres, thin-space grouping) */
export function formatMetres(metres: number | null | undefined): string {
  if (metres == null || !Number.isFinite(metres)) return '0'
  return Math.round(metres)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f')
}

export function formatKm(metres: number): string {
  return `${(metres / 1000).toFixed(metres >= 100000 ? 0 : 1)} km`
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '–'
  return value.toFixed(digits)
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}
