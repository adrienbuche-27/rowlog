import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { WorkoutCreate } from '../api/types'
import type { PersistedSession } from './SessionRecorder'

interface RowLogDB extends DBSchema {
  /** The workout in progress (single key "current"). */
  active: { key: string; value: PersistedSession }
  /** Finished workouts not yet accepted by the backend. */
  outbox: { key: string; value: WorkoutCreate }
}

let dbPromise: Promise<IDBPDatabase<RowLogDB>> | null = null

function db() {
  dbPromise ??= openDB<RowLogDB>('rowlog', 1, {
    upgrade(database) {
      database.createObjectStore('active')
      database.createObjectStore('outbox', { keyPath: 'client_id' })
    },
  })
  return dbPromise
}

export const storage = {
  saveActive: async (session: PersistedSession) => (await db()).put('active', session, 'current'),
  loadActive: async () => (await db()).get('active', 'current'),
  clearActive: async () => (await db()).delete('active', 'current'),

  addToOutbox: async (payload: WorkoutCreate) => (await db()).put('outbox', payload),
  outbox: async () => (await db()).getAll('outbox'),
  removeFromOutbox: async (clientId: string) => (await db()).delete('outbox', clientId),
}
