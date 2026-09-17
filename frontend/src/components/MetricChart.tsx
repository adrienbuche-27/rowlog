import { useMemo } from 'react'
import type uPlot from 'uplot'
import type { Sample } from '../api/types'
import { formatDuration } from '../lib/format'
import { METRICS, cssVar, type MetricKey } from '../lib/metrics'
import { UPlotChart } from './UPlotChart'

interface Props {
  samples: Sample[]
  metric: MetricKey
  /** Seconds of history to show; 0 or undefined shows everything. */
  windowS?: number
  /** Bump to refresh when `samples` is mutated in place. */
  version?: number
  height?: number
}

export function MetricChart({ samples, metric, windowS = 0, version = 0, height = 220 }: Props) {
  const def = METRICS[metric]

  const data = useMemo<uPlot.AlignedData>(() => {
    const lastT = samples.length ? samples[samples.length - 1].t : 0
    const from = windowS > 0 ? lastT - windowS : -Infinity
    const xs: number[] = []
    const ys: (number | null)[] = []
    for (const s of samples) {
      if (s.t < from) continue
      xs.push(s.t)
      ys.push(def.pick(s))
    }
    return [xs, ys]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samples, metric, windowS, version, samples.length])

  const options = useMemo<Omit<uPlot.Options, 'width' | 'height'>>(() => {
    const line = cssVar('--line')
    const muted = cssVar('--mist')
    const axis = { stroke: muted, grid: { stroke: line, width: 1 }, ticks: { stroke: line, width: 1 } }
    return {
      legend: { show: false },
      cursor: { drag: { x: false, y: false } },
      scales: {
        x: { time: false },
        y: { dir: def.invert ? -1 : 1 },
      },
      axes: [
        { ...axis, values: (_u, vals) => vals.map((v) => formatDuration(v)) },
        { ...axis, size: 60, values: (_u, vals) => vals.map((v) => (v == null ? '' : def.format(v))) },
      ],
      series: [
        {},
        { label: def.label, stroke: cssVar(def.colorVar), width: 2, spanGaps: false, points: { show: false } },
      ],
    }
  }, [def])

  return (
    <UPlotChart
      options={options}
      data={data}
      height={height}
      optionsKey={metric}
      ariaLabel={`${def.label} over time`}
    />
  )
}
