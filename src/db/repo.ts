import { db, newId } from './db';
import type { Exercise, LoggedSet, Plan, PlanDay, Session, SourceType } from './types';
import type { ParsedPlan } from '../parser/types';

export async function createPlanFromParsed(
  parsed: ParsedPlan,
  sourceType: SourceType,
  sourceFileName?: string,
  sourceFileId?: string,
): Promise<Plan> {
  const plan: Plan = {
    id: newId(),
    name: parsed.name || 'Imported Plan',
    sourceType,
    sourceFileName,
    sourceFileId,
    importDate: Date.now(),
    isActive: true,
    rawStructure: parsed,
  };

  const days: PlanDay[] = [];
  const exercises: Exercise[] = [];

  parsed.days.forEach((d, dayOrder) => {
    const day: PlanDay = {
      id: newId(),
      planId: plan.id,
      week: d.week,
      order: dayOrder,
      label: d.label,
    };
    days.push(day);
    d.exercises.forEach((e, exOrder) => {
      exercises.push({
        id: newId(),
        planId: plan.id,
        dayId: day.id,
        order: exOrder,
        name: e.name,
        targetSets: e.targetSets,
        targetReps: e.targetReps,
        targetWeight: e.targetWeight,
        notes: e.notes,
      });
    });
  });

  await db.transaction('rw', db.plans, db.planDays, db.exercises, async () => {
    const existing = await db.plans.toArray();
    await Promise.all(existing.filter((p) => p.isActive).map((p) => db.plans.update(p.id, { isActive: false })));
    await db.plans.add(plan);
    await db.planDays.bulkAdd(days);
    await db.exercises.bulkAdd(exercises);
  });

  return plan;
}

export async function getActivePlan(): Promise<Plan | undefined> {
  const plans = await db.plans.toArray();
  return plans.find((p) => p.isActive);
}

export async function getAllPlans(): Promise<Plan[]> {
  return db.plans.orderBy('importDate').reverse().toArray();
}

export async function setActivePlan(planId: string): Promise<void> {
  const allPlans = await db.plans.toArray();
  await db.transaction('rw', db.plans, async () => {
    await Promise.all(
      allPlans.map((p) => db.plans.update(p.id, { isActive: p.id === planId })),
    );
  });
}

export async function deletePlan(planId: string): Promise<void> {
  const days = await db.planDays.where('planId').equals(planId).toArray();
  const dayIds = days.map((d) => d.id);
  const exercises = await db.exercises.where('planId').equals(planId).toArray();
  const exerciseIds = exercises.map((e) => e.id);
  const sessions = await db.sessions.where('planId').equals(planId).toArray();
  const sessionIds = sessions.map((s) => s.id);
  const loggedSets = await db.loggedSets.where('sessionId').anyOf(sessionIds).toArray();

  await db.transaction('rw', db.plans, db.planDays, db.exercises, db.sessions, db.loggedSets, async () => {
    await db.loggedSets.bulkDelete(loggedSets.map((s) => s.id));
    await db.sessions.bulkDelete(sessionIds);
    await db.exercises.bulkDelete(exerciseIds);
    await db.planDays.bulkDelete(dayIds);
    await db.plans.delete(planId);
  });
}

export async function getPlanDays(planId: string): Promise<PlanDay[]> {
  const days = await db.planDays.where('planId').equals(planId).toArray();
  return days.sort((a, b) => a.order - b.order);
}

export async function getExercisesForDay(dayId: string): Promise<Exercise[]> {
  const exs = await db.exercises.where('dayId').equals(dayId).toArray();
  return exs.sort((a, b) => a.order - b.order);
}

export async function getExercisesForPlan(planId: string): Promise<Exercise[]> {
  return db.exercises.where('planId').equals(planId).toArray();
}

/** Determines which PlanDay comes next, cycling through the program in order. */
export async function getNextDay(planId: string): Promise<PlanDay | undefined> {
  const days = await getPlanDays(planId);
  if (days.length === 0) return undefined;
  const finishedCount = await db.sessions
    .where('planId')
    .equals(planId)
    .filter((s) => s.status === 'completed' || s.status === 'skipped')
    .count();
  return days[finishedCount % days.length];
}

/** Returns the in-progress ("planned") session for a plan, if one exists. */
export async function getOpenSession(planId: string): Promise<Session | undefined> {
  return db.sessions.where('planId').equals(planId).filter((s) => s.status === 'planned').first();
}

export async function startSession(planId: string, dayId: string): Promise<Session> {
  const session: Session = {
    id: newId(),
    planId,
    dayId,
    date: Date.now(),
    status: 'planned',
    completedAt: null,
  };
  await db.sessions.add(session);
  return session;
}

export async function completeSession(sessionId: string): Promise<void> {
  await db.sessions.update(sessionId, { status: 'completed', completedAt: Date.now() });
}

export async function skipSession(sessionId: string): Promise<void> {
  await db.sessions.update(sessionId, { status: 'skipped', completedAt: Date.now() });
}

export async function logSet(input: {
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  reps: number | null;
  weight: number | null;
  rpe: number | null;
  notes?: string | null;
}): Promise<LoggedSet> {
  const set: LoggedSet = {
    id: newId(),
    sessionId: input.sessionId,
    exerciseId: input.exerciseId,
    setNumber: input.setNumber,
    reps: input.reps,
    weight: input.weight,
    rpe: input.rpe,
    notes: input.notes ?? null,
    timestamp: Date.now(),
  };
  await db.loggedSets.add(set);
  return set;
}

export async function deleteLoggedSet(setId: string): Promise<void> {
  await db.loggedSets.delete(setId);
}

export async function getLoggedSetsForSession(sessionId: string): Promise<LoggedSet[]> {
  const sets = await db.loggedSets.where('sessionId').equals(sessionId).toArray();
  return sets.sort((a, b) => a.timestamp - b.timestamp);
}

export async function getLoggedSetsForExercise(sessionId: string, exerciseId: string): Promise<LoggedSet[]> {
  const sets = await db.loggedSets
    .where('sessionId')
    .equals(sessionId)
    .filter((s) => s.exerciseId === exerciseId)
    .toArray();
  return sets.sort((a, b) => a.timestamp - b.timestamp);
}

export async function getSessionsForPlan(planId: string): Promise<Session[]> {
  const sessions = await db.sessions.where('planId').equals(planId).toArray();
  return sessions.sort((a, b) => b.date - a.date);
}
