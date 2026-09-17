import { lazy, Suspense } from 'react'
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { ConnectionBadge } from './components/ConnectionBadge'
import { HistoryPage } from './pages/HistoryPage'
import { LivePage } from './pages/LivePage'
import { SettingsPage } from './pages/SettingsPage'
import { WorkoutPage } from './pages/WorkoutPage'
import { SessionProvider, useSession } from './session/SessionProvider'

// Pulls in Leaflet (~150 kB); split out of the main bundle since only this page needs it.
const RoutesPage = lazy(() => import('./pages/RoutesPage').then((m) => ({ default: m.RoutesPage })))

function Header() {
  const { connection, snapshot } = useSession()
  const recording = snapshot.status === 'recording'
  // The Row page has its own, more detailed connection bar.
  const onRowPage = useLocation().pathname === '/'
  return (
    <header className="site-header">
      <NavLink to="/" className="brand" aria-label="RowLog home">
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden>
          <path d="M5 20c3.5 0 3.5-3 7-3s3.5 3 7 3 3.5-3 7-3" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M8 12h16" stroke="var(--ash)" strokeWidth="3" strokeLinecap="round" />
        </svg>
        RowLog
      </NavLink>
      <nav aria-label="Main">
        <NavLink to="/" end>Row{recording && <span className="rec-dot" aria-label="recording" />}</NavLink>
        <NavLink to="/history">History</NavLink>
        <NavLink to="/routes">Courses</NavLink>
        <NavLink to="/settings">Settings</NavLink>
      </nav>
      {!onRowPage && <ConnectionBadge info={connection} />}
    </header>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Header />
        <main className="site-main">
          <Routes>
            <Route path="/" element={<LivePage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route
              path="/routes"
              element={
                <Suspense fallback={<p className="page-message">Loading courses</p>}>
                  <RoutesPage />
                </Suspense>
              }
            />
            <Route path="/workouts/:id" element={<WorkoutPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </SessionProvider>
    </BrowserRouter>
  )
}
