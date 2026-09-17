import { useEffect } from 'react'

/** Keep the screen (and the laptop) awake while `active`. Re-acquired when the tab becomes visible. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      try {
        if (document.visibilityState === 'visible' && !lock) {
          lock = await navigator.wakeLock.request('screen')
          lock.addEventListener('release', () => {
            lock = null
          })
          if (cancelled) void lock.release()
        }
      } catch {
        /* denied, e.g. battery saver */
      }
    }
    const onVisible = () => void acquire()

    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [active])
}
