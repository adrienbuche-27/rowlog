import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { HistoryPage } from './pages/HistoryPage'
import { LivePage } from './pages/LivePage'
import { PlansPage } from './pages/PlansPage'
import { SettingsPage } from './pages/SettingsPage'
import { SessionProvider } from './session/SessionProvider'

// Pulls in Leaflet (~150 kB); split out of the main bundle since only this page needs it.
const RoutesPage = lazy(() => import('./pages/RoutesPage').then((m) => ({ default: m.RoutesPage })))

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <div className="app-shell">
          <Sidebar />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<LivePage />} />
              {/* A workout opens inside the History workspace rather than on its own page. */}
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/workouts/:id" element={<HistoryPage />} />
              <Route path="/plans" element={<PlansPage />} />
              <Route
                path="/routes"
                element={
                  <Suspense fallback={<p className="page-message">Loading courses</p>}>
                    <RoutesPage />
                  </Suspense>
                }
              />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </SessionProvider>
    </BrowserRouter>
  )
}
