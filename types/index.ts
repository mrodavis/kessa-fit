export type { Database } from './database';

export interface WorkoutSet {
  id: string;
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  isWarmup: boolean;
  supersetGroupId: string | null;
  createdAt: string;
}

export interface ActiveWorkout {
  id: string;
  name: string;
  startedAt: string;
  sets: WorkoutSet[];
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
}
