import type { Sample } from '../api/types'
import { formatPace } from './format'

export type MetricKey = 'pace' | 'power' | 'spm' | 'hr'

export interface MetricDef {
  key: MetricKey
  label: string
  unit: string
  /** CSS custom property holding the series colour. */
  colorVar: string
  /** Lower is better: draw the axis upside down so "faster" goes up. */
  invert?: boolean
  pick: (s: Sample) => number | null
  format: (v: number) => string
}

export const METRICS: Record<MetricKey, MetricDef> = {
  pace: {
    key: 'pace', label: 'Split', unit: '/500 m', colorVar: '--water', invert: true,
    pick: (s) => s.pace, format: formatPace,
  },
  power: {
    key: 'power', label: 'Power', unit: 'W', colorVar: '--ash',
    pick: (s) => (s.connected ? s.power : null), format: (v) => v.toFixed(0),
  },
  spm: {
    key: 'spm', label: 'Stroke rate', unit: 'spm', colorVar: '--reed',
    pick: (s) => s.spm, format: (v) => v.toFixed(0),
  },
  hr: {
    key: 'hr', label: 'Heart rate', unit: 'bpm', colorVar: '--pulse',
    pick: (s) => s.hr, format: (v) => v.toFixed(0),
  },
}

export function cssVar(name: string): string {
  if (typeof document === 'undefined') return '#888'
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'
}
