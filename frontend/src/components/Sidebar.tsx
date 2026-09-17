import { NavLink, useLocation } from 'react-router-dom'
import { useSession } from '../session/SessionProvider'
import { ConnectionBadge } from './ConnectionBadge'

const icon = (path: React.ReactNode) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {path}
  </svg>
)

const ICON_ROW = icon(<path d="M3 15c2.6 0 2.6-2.5 5.2-2.5S10.8 15 13.4 15s2.6-2.5 5.2-2.5M6 8h12" />)
const ICON_HISTORY = icon(<path d="M4 6h16M4 12h16M4 18h10" />)
const ICON_COURSES = icon(<path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2v14" />)
const ICON_SETTINGS = icon(<><circle cx="12" cy="12" r="3" /><path d="M12 3v2m0 14v2M5 12H3m18 0h-2M6.3 6.3 4.9 4.9m14.2 14.2-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" /></>)

export function Sidebar() {
  const { connection, snapshot } = useSession()
  const recording = snapshot.status === 'recording'
  const { pathname } = useLocation()
  // A workout lives inside the History workspace, so keep History lit while one is open.
  const historyOpen = pathname.startsWith('/history') || pathname.startsWith('/workouts')
  // The Row page has its own, more detailed connection bar.
  const onRowPage = pathname === '/'

  return (
    // The aside stretches the full page height so the rail's card stock and ink rule run all
    // the way down; the inner wrapper is what sticks while you scroll.
    <aside className="sidebar">
      <div className="sidebar-inner">
        <NavLink to="/" className="brand" aria-label="RowLog home">
          <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden>
            <path d="M5 20c3.5 0 3.5-3 7-3s3.5 3 7 3 3.5-3 7-3" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <path d="M8 12h16" stroke="var(--ash)" strokeWidth="3" strokeLinecap="round" />
          </svg>
          RowLog
        </NavLink>

        <nav className="sidebar-nav" aria-label="Main">
          <NavLink to="/" end>
            {ICON_ROW}
            <span>Row</span>
            {recording && <span className="rec-dot" aria-label="recording" />}
          </NavLink>
          <NavLink to="/history" className={() => (historyOpen ? 'active' : '')}>
            {ICON_HISTORY}
            <span>History</span>
          </NavLink>
          <NavLink to="/routes">
            {ICON_COURSES}
            <span>Courses</span>
          </NavLink>
          <NavLink to="/settings">
            {ICON_SETTINGS}
            <span>Settings</span>
          </NavLink>
        </nav>

        {!onRowPage && (
          <div className="sidebar-foot">
            <ConnectionBadge info={connection} />
          </div>
        )}
      </div>
    </aside>
  )
}
