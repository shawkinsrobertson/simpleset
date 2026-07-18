import { db } from '../db/db';
import type { Exercise, LoggedSet, Session } from '../db/types';
import { getPlanDays, getExercisesForPlan } from '../db/repo';
import { formatSeconds } from './targets';

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

/** Consecutive completed sessions counting back from the most recent finished session — breaks on the first skip. */
export async function getStreak(planId: string): Promise<number> {
  const sessions = await db.sessions
    .where('planId')
    .equals(planId)
    .filter((s) => s.status === 'completed' || s.status === 'skipped')
    .sortBy('date');
  let streak = 0;
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].status !== 'completed') break;
    streak++;
  }
  return streak;
}

export interface CycleProgress {
  completed: number;
  total: number;
}

/** "Sessions completed" fraction for the plan's current lap through its days — resets every time a full cycle finishes. */
export async function getCycleProgress(planId: string): Promise<CycleProgress> {
  const days = await getPlanDays(planId);
  const total = days.length;
  if (total === 0) return { completed: 0, total: 0 };

  const finished = await db.sessions
    .where('planId')
    .equals(planId)
    .filter((s) => s.status === 'completed' || s.status === 'skipped')
    .sortBy('date');

  const posInCycle = finished.length % total;
  const currentLap = posInCycle === 0 ? [] : finished.slice(-posInCycle);
  const completed = currentLap.filter((s) => s.status === 'completed').length;
  return { completed, total };
}

export interface PersonalRecord {
  exerciseId: string;
  exerciseName: string;
  type: 'weight' | 'reps' | 'time';
  display: string;
  achievedAt: number;
}

/**
 * Best logged value per exercise, direction-aware: weight/reps are always
 * higher-is-better; timed exercises depend on Exercise.category — 'strength'
 * (holds) means longer is better, 'conditioning' (runs/metcons) means
 * shorter is better.
 */
export async function getPersonalRecords(planId: string): Promise<PersonalRecord[]> {
  const exercises = await getExercisesForPlan(planId, { includeArchived: true });
  const records: PersonalRecord[] = [];

  for (const ex of exercises) {
    const sets = await db.loggedSets.where('exerciseId').equals(ex.id).toArray();
    if (sets.length === 0) continue;

    if (ex.targetTime != null) {
      const timed = sets.filter((s) => s.timeSeconds != null);
      if (timed.length === 0) continue;
      const best = timed.reduce((a, b) => {
        const better = ex.category === 'conditioning' ? b.timeSeconds! < a.timeSeconds! : b.timeSeconds! > a.timeSeconds!;
        return better ? b : a;
      });
      records.push({
        exerciseId: ex.id,
        exerciseName: ex.name,
        type: 'time',
        display: formatSeconds(best.timeSeconds),
        achievedAt: best.timestamp,
      });
      continue;
    }

    const weighted = sets.filter((s) => s.weight != null && s.weight > 0);
    if (weighted.length > 0) {
      const best = weighted.reduce((a, b) => (b.weight! > a.weight! ? b : a));
      records.push({
        exerciseId: ex.id,
        exerciseName: ex.name,
        type: 'weight',
        display: `${best.weight} lb`,
        achievedAt: best.timestamp,
      });
      continue;
    }

    const repped = sets.filter((s) => s.reps != null);
    if (repped.length > 0) {
      const best = repped.reduce((a, b) => (b.reps! > a.reps! ? b : a));
      records.push({
        exerciseId: ex.id,
        exerciseName: ex.name,
        type: 'reps',
        display: `${best.reps} reps`,
        achievedAt: best.timestamp,
      });
    }
  }

  return records.sort((a, b) => b.achievedAt - a.achievedAt);
}

export interface ConsistencyDay {
  date: number;
  completed: boolean;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** GitHub-style consistency grid: `weeks` columns of 7 rows (Sun–Sat), ending at the current week. */
export async function getConsistencyGrid(planId: string, weeks: number): Promise<ConsistencyDay[][]> {
  const sessions = await db.sessions
    .where('planId')
    .equals(planId)
    .filter((s) => s.status === 'completed')
    .toArray();
  const completedDays = new Set(sessions.map((s) => startOfDay(s.date)));

  const today = startOfDay(Date.now());
  const daysSinceSunday = new Date(today).getDay();
  const currentWeekStart = today - daysSinceSunday * 86400000;
  const gridStart = currentWeekStart - (weeks - 1) * 7 * 86400000;

  const columns: ConsistencyDay[][] = [];
  for (let w = 0; w < weeks; w++) {
    const week: ConsistencyDay[] = [];
    for (let d = 0; d < 7; d++) {
      const date = gridStart + (w * 7 + d) * 86400000;
      week.push({ date, completed: completedDays.has(date) });
    }
    columns.push(week);
  }
  return columns;
}

/** Average completed sessions per calendar week, since the first completed session. */
export async function getAvgSessionsPerWeek(planId: string): Promise<number | null> {
  const sessions = await db.sessions
    .where('planId')
    .equals(planId)
    .filter((s) => s.status === 'completed')
    .sortBy('date');
  if (sessions.length === 0) return null;
  const spanMs = Date.now() - sessions[0].date;
  const spanWeeks = Math.max(1, spanMs / (7 * 86400000));
  return Math.round((sessions.length / spanWeeks) * 10) / 10;
}

export type StatsRange = '1m' | '3m' | '6m' | 'all';

/** Consistency-grid column count for a range control, capped at the plan's actual history when the plan is younger. */
export function weeksForRange(range: StatsRange, planImportDate: number): number {
  const weeksSinceImport = Math.max(1, Math.ceil((Date.now() - planImportDate) / (7 * 86400000)));
  const capByRange: Record<StatsRange, number> = { '1m': 4, '3m': 13, '6m': 26, all: weeksSinceImport };
  return Math.min(capByRange[range], range === 'all' ? weeksSinceImport : capByRange[range]);
}

function bestTime(sets: LoggedSet[], category: Exercise['category']): number | null {
  const timed = sets.filter((s) => s.timeSeconds != null).map((s) => s.timeSeconds!);
  if (timed.length === 0) return null;
  return category === 'conditioning' ? Math.min(...timed) : Math.max(...timed);
}

function beatsTime(a: number, b: number, category: Exercise['category']): boolean {
  return category === 'conditioning' ? a < b : a > b;
}

export interface SessionPr {
  exerciseId: string;
  exerciseName: string;
  display: string;
}

export interface SessionSummary {
  totalVolume: number;
  totalReps: number;
  prs: SessionPr[];
}

/**
 * Stats for the post-workout summary screen: this session's total volume
 * and reps, plus which exercises got a new PR *in this session* — direction-
 * aware the same way getPersonalRecords is, but comparing against every
 * other session's history rather than just reporting the current best.
 * Only counts as a PR if there's prior history to beat (a first-ever
 * performance isn't a "PR" in the exciting sense).
 */
export async function getSessionSummary(sessionId: string): Promise<SessionSummary> {
  const sessionSets = await db.loggedSets.where('sessionId').equals(sessionId).toArray();
  const totalVolume = sessionSets.reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0);
  const totalReps = sessionSets.reduce((sum, s) => sum + (s.reps ?? 0), 0);

  const exerciseIds = [...new Set(sessionSets.map((s) => s.exerciseId))];
  const prs: SessionPr[] = [];

  for (const exerciseId of exerciseIds) {
    const exercise = await db.exercises.get(exerciseId);
    if (!exercise) continue;

    const allSets = await db.loggedSets.where('exerciseId').equals(exerciseId).toArray();
    const thisSessionSets = allSets.filter((s) => s.sessionId === sessionId);
    const priorSets = allSets.filter((s) => s.sessionId !== sessionId);

    if (exercise.targetTime != null) {
      const thisBest = bestTime(thisSessionSets, exercise.category);
      const priorBest = bestTime(priorSets, exercise.category);
      if (thisBest != null && priorBest != null && beatsTime(thisBest, priorBest, exercise.category)) {
        prs.push({ exerciseId, exerciseName: exercise.name, display: formatSeconds(thisBest) });
      }
      continue;
    }

    const thisWeighted = thisSessionSets.filter((s) => s.weight != null && s.weight > 0);
    const priorWeighted = priorSets.filter((s) => s.weight != null && s.weight > 0);
    if (thisWeighted.length > 0 && priorWeighted.length > 0) {
      const thisBest = Math.max(...thisWeighted.map((s) => s.weight!));
      const priorBest = Math.max(...priorWeighted.map((s) => s.weight!));
      if (thisBest > priorBest) {
        prs.push({ exerciseId, exerciseName: exercise.name, display: `${thisBest} lb` });
      }
      continue;
    }

    const thisRepped = thisSessionSets.filter((s) => s.reps != null);
    const priorRepped = priorSets.filter((s) => s.reps != null);
    if (thisRepped.length > 0 && priorRepped.length > 0) {
      const thisBest = Math.max(...thisRepped.map((s) => s.reps!));
      const priorBest = Math.max(...priorRepped.map((s) => s.reps!));
      if (thisBest > priorBest) {
        prs.push({ exerciseId, exerciseName: exercise.name, display: `${thisBest} reps` });
      }
    }
  }

  return { totalVolume, totalReps, prs };
}
