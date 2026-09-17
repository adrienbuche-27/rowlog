import { METRICS, type MetricKey } from '../lib/metrics'

interface Props {
  value: MetricKey
  onChange: (key: MetricKey) => void
  available?: MetricKey[]
}

export function MetricTabs({ value, onChange, available = ['pace', 'power', 'spm', 'hr'] }: Props) {
  return (
    <div className="segmented" role="tablist" aria-label="Chart metric">
      {available.map((key) => (
        <button
          key={key}
          role="tab"
          aria-selected={value === key}
          className={value === key ? 'is-active' : undefined}
          onClick={() => onChange(key)}
        >
          {METRICS[key].label}
        </button>
      ))}
    </div>
  )
}
