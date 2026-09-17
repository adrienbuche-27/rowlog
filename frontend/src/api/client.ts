import type {
  StatsOverview,
  StravaStatus,
  WorkoutCreate,
  WorkoutDetail,
  WorkoutSummary,
} from './types'

const BASE = import.meta.env?.VITE_API_BASE ?? ''

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      message = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  listWorkouts: () => request<WorkoutSummary[]>('/api/workouts'),
  getWorkout: (id: number) => request<WorkoutDetail>(`/api/workouts/${id}`),
  createWorkout: (payload: WorkoutCreate) =>
    request<WorkoutSummary>('/api/workouts', { method: 'POST', body: JSON.stringify(payload) }),
  updateNotes: (id: number, notes: string) =>
    request<WorkoutSummary>(`/api/workouts/${id}`, { method: 'PATCH', body: JSON.stringify({ notes }) }),
  deleteWorkout: (id: number) => request<void>(`/api/workouts/${id}`, { method: 'DELETE' }),
  fitUrl: (id: number) => `${BASE}/api/workouts/${id}/fit`,

  stats: () => request<StatsOverview>('/api/stats/overview'),

  stravaStatus: () => request<StravaStatus>('/api/strava/status'),
  stravaAuthorizeUrl: `${BASE}/api/strava/authorize`,
  disconnectStrava: () => request<void>('/api/strava/connection', { method: 'DELETE' }),
  uploadToStrava: (id: number) => request<WorkoutSummary>(`/api/workouts/${id}/strava`, { method: 'POST' }),
  refreshStrava: (id: number) => request<WorkoutSummary>(`/api/workouts/${id}/strava`),
}
