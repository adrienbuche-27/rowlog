/** Mirrors backend/app/schemas.py. Keep both in sync. */

export interface Sample {
  /** seconds since start, pauses excluded */
  t: number
  distance: number
  strokes: number
  spm: number | null
  power: number | null
  /** seconds per 500 m */
  pace: number | null
  hr: number | null
  calories: number | null
  connected: boolean
}

export interface WorkoutCreate {
  client_id: string
  started_at: string
  notes: string
  samples: Sample[]
}

export type StravaUploadStatus = 'none' | 'processing' | 'done' | 'error'

export interface WorkoutSummary {
  id: number
  client_id: string
  started_at: string
  duration_s: number
  distance_m: number
  strokes: number
  calories: number
  avg_split_s: number | null
  avg_spm: number | null
  max_spm: number | null
  avg_power_w: number | null
  max_power_w: number | null
  avg_hr: number | null
  max_hr: number | null
  disconnect_s: number
  notes: string
  strava_status: StravaUploadStatus
  strava_activity_id: number | null
  strava_error: string | null
}

export interface Split {
  index: number
  distance_m: number
  time_s: number
  split_s: number
  avg_spm: number | null
  avg_power_w: number | null
  avg_hr: number | null
}

export interface WorkoutDetail extends WorkoutSummary {
  samples: Sample[]
  splits: Split[]
}

export interface StatsOverview {
  total_distance_m: number
  total_duration_s: number
  total_workouts: number
  weekly: { week_start: string; distance_m: number; duration_s: number; workouts: number }[]
  split_trend: { workout_id: number; date: string; avg_split_s: number; distance_m: number }[]
  personal_bests: { distance_m: number; time_s: number; split_s: number; workout_id: number; date: string }[]
}

export interface StravaStatus {
  configured: boolean
  connected: boolean
  athlete_name: string | null
}
