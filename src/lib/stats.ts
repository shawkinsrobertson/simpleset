import { db } from '../db/db';
import type { Exercise, Session } from '../db/types';

export interface VolumePoint {
  date: number;
  sessionId: string;
  volume: number;
}

/** Total volume (sum of weight * reps across all logged sets) per completed session. */
export async function getVolumeOverTime(planId: string): Promise<VolumePoint[]> {
  const sessions = await db.sessions
    .where('planId')
    .equals(planId)
    .filter((s) => s.status === 'completed')
    .toArray();

  const points: VolumePoint[] = [];
  for (const session of sessions) {
    const sets = await db.loggedSets.where('sessionId').equals(session.id).toArray();
    const volume = sets.reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0);
    points.push({ date: session.date, sessionId: session.id, volume });
  }
  return points.sort((a, b) => a.date - b.date);
}

export interface ExerciseTrendPoint {
  date: number;
  sessionId: string;
  topWeight: number;
  totalReps: number;
  volume: number;
}

/** Per-exercise progress: top weight and total reps logged, one point per session. */
export async function getExerciseTrend(planId: string, exerciseId: string): Promise<ExerciseTrendPoint[]> {
  const sessions = await db.sessions
    .where('planId')
    .equals(planId)
    .filter((s) => s.status === 'completed')
    .toArray();

  const points: ExerciseTrendPoint[] = [];
  for (const session of sessions) {
    const sets = await db.loggedSets
      .where('sessionId')
      .equals(session.id)
      .filter((s) => s.exerciseId === exerciseId)
      .toArray();
    if (sets.length === 0) continue;
    const topWeight = Math.max(...sets.map((s) => s.weight ?? 0));
    const totalReps = sets.reduce((sum, s) => sum + (s.reps ?? 0), 0);
    const volume = sets.reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0);
    points.push({ date: session.date, sessionId: session.id, topWeight, totalReps, volume });
  }
  return points.sort((a, b) => a.date - b.date);
}

export async function getExercisesWithHistory(planId: string): Promise<Exercise[]> {
  const exercises = await db.exercises.where('planId').equals(planId).toArray();
  const loggedExerciseIds = new Set(
    (await db.loggedSets.toArray())
      .filter((s) => exercises.some((e) => e.id === s.exerciseId))
      .map((s) => s.exerciseId),
  );
  return exercises.filter((e) => loggedExerciseIds.has(e.id));
}

export interface AdherenceStats {
  completed: number;
  skipped: number;
  total: number;
  percent: number | null;
}

export async function getAdherence(planId: string, sinceMs?: number): Promise<AdherenceStats> {
  let sessions: Session[] = await db.sessions
    .where('planId')
    .equals(planId)
    .filter((s) => s.status === 'completed' || s.status === 'skipped')
    .toArray();

  if (sinceMs) {
    sessions = sessions.filter((s) => s.date >= sinceMs);
  }

  const completed = sessions.filter((s) => s.status === 'completed').length;
  const skipped = sessions.filter((s) => s.status === 'skipped').length;
  const total = completed + skipped;
  return { completed, skipped, total, percent: total > 0 ? Math.round((completed / total) * 100) : null };
}
