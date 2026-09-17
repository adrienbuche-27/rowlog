import type { ConnectionInfo } from '../ble/types'

const LABELS: Record<ConnectionInfo['state'], string> = {
  disconnected: 'Not connected',
  connecting: 'Connecting',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
}

export function ConnectionBadge({ info }: { info: ConnectionInfo }) {
  const detail =
    info.state === 'connected'
      ? info.deviceName
      : info.state === 'reconnecting'
        ? `attempt ${info.attempt}`
        : null
  return (
    <span className={`badge badge-${info.state}`} role="status" aria-live="polite">
      <span className="badge-dot" aria-hidden />
      {LABELS[info.state]}
      {detail && <span className="badge-detail">{detail}</span>}
    </span>
  )
}
