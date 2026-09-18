import type {
  PlanCreate,
  PlanInfo,
  RouteInfo,
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
  // Let the browser set its own multipart boundary for FormData bodies.
  const jsonHeaders: Record<string, string> =
    init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...jsonHeaders, ...(init.headers ?? {}) },
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
  updateRoute: (id: number, routeId: number | null) =>
    request<WorkoutSummary>(`/api/workouts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ route_id: routeId }),
    }),
  deleteWorkout: (id: number) => request<void>(`/api/workouts/${id}`, { method: 'DELETE' }),
  fitUrl: (id: number) => `${BASE}/api/workouts/${id}/fit`,

  plans: () => request<PlanInfo[]>('/api/plans'),
  createPlan: (payload: PlanCreate) =>
    request<PlanInfo>('/api/plans', { method: 'POST', body: JSON.stringify(payload) }),
  deletePlan: (id: number) => request<void>(`/api/plans/${id}`, { method: 'DELETE' }),

  routes: () => request<RouteInfo[]>('/api/routes'),
  createRoute: (name: string, file: File) => {
    const form = new FormData()
    form.append('name', name)
    form.append('file', file)
    return request<RouteInfo>('/api/routes', { method: 'POST', body: form })
  },
  deleteRoute: (id: number) => request<void>(`/api/routes/${id}`, { method: 'DELETE' }),

  stats: () => request<StatsOverview>('/api/stats/overview'),

  stravaStatus: () => request<StravaStatus>('/api/strava/status'),
  stravaAuthorizeUrl: `${BASE}/api/strava/authorize`,
  disconnectStrava: () => request<void>('/api/strava/connection', { method: 'DELETE' }),
  uploadToStrava: (id: number) => request<WorkoutSummary>(`/api/workouts/${id}/strava`, { method: 'POST' }),
  refreshStrava: (id: number) => request<WorkoutSummary>(`/api/workouts/${id}/strava`),
}
