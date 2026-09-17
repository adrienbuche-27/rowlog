import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import type { StravaStatus } from '../api/types'
import { Toggle } from '../components/Toggle'
import { useSession } from '../session/SessionProvider'

const OAUTH_MESSAGES: Record<string, string> = {
  connected: 'Strava is connected.',
  denied: 'Strava access was not granted. Connect again and allow uploading activities.',
  invalid_state: 'The Strava sign-in link expired. Connect again.',
  error: 'Strava rejected the sign-in. Check STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET, then connect again.',
}

export function SettingsPage() {
  const s = useSession()
  const [params, setParams] = useSearchParams()
  const [strava, setStrava] = useState<StravaStatus | null>(null)
  const [stravaError, setStravaError] = useState<string | null>(null)
  const oauthResult = params.get('strava')

  useEffect(() => {
    api.stravaStatus().then(setStrava).catch(() => setStravaError("The server can't be reached."))
  }, [])

  async function disconnectStrava() {
    await api.disconnectStrava()
    setStrava(await api.stravaStatus())
    setParams({})
  }

  return (
    <div className="settings">
      <header className="page-head">
        <h1>Settings</h1>
      </header>

      <section className="panel">
        <h2>Strava</h2>
        {oauthResult && OAUTH_MESSAGES[oauthResult] && (
          <p className={oauthResult === 'connected' ? 'success' : 'error'}>{OAUTH_MESSAGES[oauthResult]}</p>
        )}
        {stravaError && <p className="error">{stravaError}</p>}
        {strava && !strava.configured && (
          <p>
            Strava isn't set up on the server yet. Create an API application at strava.com/settings/api, then set{' '}
            <code>STRAVA_CLIENT_ID</code> and <code>STRAVA_CLIENT_SECRET</code> in <code>backend/.env</code> and restart
            the backend.
          </p>
        )}
        {strava?.configured && !strava.connected && (
          <a className="btn btn-strava" href={api.stravaAuthorizeUrl}>
            Connect with Strava
          </a>
        )}
        {strava?.connected && (
          <div className="stack-actions">
            <p>Connected as {strava.athlete_name || 'your Strava account'}.</p>
            <button className="btn" onClick={disconnectStrava}>Disconnect Strava</button>
          </div>
        )}
        <Toggle
          label="Upload workouts to Strava automatically"
          description="Each saved workout is sent as an indoor rowing activity."
          checked={s.settings.autoStrava}
          onChange={(autoStrava) => s.updateSettings({ autoStrava })}
        />
      </section>

      <section className="panel">
        <h2>During a workout</h2>
        <Toggle
          label="Start the timer with the first stroke"
          description="Press Start, sit down, and begin rowing when ready."
          checked={s.settings.startOnFirstStroke}
          onChange={(startOnFirstStroke) => s.updateSettings({ startOnFirstStroke })}
        />
        <Toggle
          label="Beep when the rower disconnects"
          description="The app reconnects on its own; the beep tells you data is briefly missing."
          checked={s.settings.beepOnDrop}
          onChange={(beepOnDrop) => s.updateSettings({ beepOnDrop })}
        />
      </section>

      <section className="panel">
        <h2>Saved on this computer</h2>
        <p>
          {s.outboxPending === 0
            ? 'All workouts have been sent to the server.'
            : `${s.outboxPending} workout${s.outboxPending > 1 ? 's are' : ' is'} waiting to be sent.`}
        </p>
        {s.outboxError && <p className="error">{s.outboxError}</p>}
        {s.outboxPending > 0 && <button className="btn" onClick={s.syncNow}>Send now</button>}
      </section>

      <section className="panel">
        <h2>Bluetooth troubleshooting</h2>
        <ul className="plain-list">
          <li>Use Chrome or Edge. Safari and Firefox don't support Bluetooth for web pages.</li>
          <li>
            Close other rowing apps and disconnect the rower from your phone: the ComModule accepts only one
            connection at a time.
          </li>
          <li>
            To reconnect after reloading the page without choosing the device again, enable{' '}
            <code>chrome://flags/#enable-web-bluetooth-new-permissions-backend</code>.
          </li>
          <li>On Linux, Chrome may also need <code>chrome://flags/#enable-experimental-web-platform-features</code>.</li>
        </ul>
        <Toggle
          label="Log raw Bluetooth packets"
          description="Prints each notification to the browser console. Takes effect on the next connection."
          checked={s.settings.debugPackets}
          onChange={(debugPackets) => s.updateSettings({ debugPackets })}
        />
      </section>
    </div>
  )
}
