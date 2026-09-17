export interface AppSettings {
  /** Upload each saved workout to Strava automatically. */
  autoStrava: boolean
  /** Short beep when the rower connection drops during a workout. */
  beepOnDrop: boolean
  /** Visible window of the live chart, in seconds. 0 = whole workout. */
  chartWindowS: number
  /** Start recording on the first stroke after pressing Start. */
  startOnFirstStroke: boolean
  /** Log raw Bluetooth packets to the browser console. */
  debugPackets: boolean
}

const KEY = 'rowlog.settings'

export const DEFAULT_SETTINGS: AppSettings = {
  autoStrava: false,
  beepOnDrop: true,
  chartWindowS: 300,
  startOnFirstStroke: true,
  debugPackets: false,
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    /* storage unavailable */
  }
}
