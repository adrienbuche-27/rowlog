interface Props {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export function Toggle({ label, description, checked, onChange }: Props) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden />
      <span className="toggle-text">
        <span className="toggle-label">{label}</span>
        {description && <span className="toggle-description">{description}</span>}
      </span>
    </label>
  )
}
