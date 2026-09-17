import { ApiError, api } from '../api/client'
import type { WorkoutSummary } from '../api/types'
import { storage } from './storage'

export interface SyncResult {
  saved: WorkoutSummary[]
  pending: number
  error: string | null
}

let running: Promise<SyncResult> | null = null

/**
 * Send queued workouts to the backend. Safe to call often: the backend is idempotent on
 * client_id, and concurrent calls share one run.
 */
export function syncOutbox(): Promise<SyncResult> {
  running ??= (async () => {
    const saved: WorkoutSummary[] = []
    let error: string | null = null
    for (const payload of await storage.outbox()) {
      try {
        saved.push(await api.createWorkout(payload))
        await storage.removeFromOutbox(payload.client_id)
      } catch (err) {
        if (err instanceof ApiError && err.status === 422) {
          // The backend rejected the payload itself; retrying won't help. Keep it for inspection.
          error = `A saved workout was rejected: ${err.message}`
          continue
        }
        error = 'The server is unreachable. Workouts are kept on this computer until it is back.'
        break
      }
    }
    return { saved, pending: (await storage.outbox()).length, error }
  })().finally(() => {
    running = null
  })
  return running
}
