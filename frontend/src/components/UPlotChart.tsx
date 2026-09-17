import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

interface Props {
  options: Omit<uPlot.Options, 'width' | 'height'>
  data: uPlot.AlignedData
  height: number
  /** Changing this rebuilds the chart; otherwise only data is updated. */
  optionsKey: string
  ariaLabel: string
}

export function UPlotChart({ options, data, height, optionsKey, ariaLabel }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const plot = useRef<uPlot | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data

  useEffect(() => {
    const el = host.current
    if (!el) return
    const chart = new uPlot({ ...options, width: el.clientWidth || 600, height }, dataRef.current, el)
    plot.current = chart
    const ro = new ResizeObserver(() => chart.setSize({ width: el.clientWidth, height }))
    ro.observe(el)
    return () => {
      ro.disconnect()
      chart.destroy()
      plot.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey, height])

  useEffect(() => {
    plot.current?.setData(data)
  }, [data])

  return <div ref={host} className="chart" role="img" aria-label={ariaLabel} />
}
