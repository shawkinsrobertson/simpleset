import { db, newId } from './db';
import type { DiffEntry, Exercise, ExerciseGroup, LoggedSet, PendingSync, Plan, PlanDay, PlanVersion, Session, SourceType } from './types';
import type { ParsedPlan } from '../parser/types';
import type { ApplyPlan } from '../sync/applyPlan';
import { runApplyPlan } from '../sync/runApplyPlan';

export interface CreatePlanSource {
  sourceType: SourceType;
  sourceFileName?: string;
  sourceFileId?: string;
  sourceMimeType?: string;
  sourceModifiedTime?: string | null;
}

export async function createPlanFromParsed(parsed: ParsedPlan, source: CreatePlanSource): Promise<Plan> {
  const plan: Plan = {
    id: newId(),
    name: parsed.name || 'Imported Plan',
    sourceType: source.sourceType,
    sourceFileName: source.sourceFileName,
    sourceFileId: source.sourceFileId,
    sourceMimeType: source.sourceMimeType,
    importDate: Date.now(),
    isActive: true,
    rawStructure: parsed,
    sourceModifiedTime: source.sourceModifiedTime ?? null,
  };

  const days: PlanDay[] = [];
  const exercises: Exercise[] = [];
  const groups: ExerciseGroup[] = [];
  const diffSummary: DiffEntry[] = [];

  parsed.days.forEach((d, dayOrder) => {
    const day: PlanDay = {
      id: newId(),
      planId: plan.id,
      week: d.week,
      order: dayOrder,
      label: d.label,
      archived: false,
    };
    days.push(day);

    const groupIdByTempId = new Map<string, string>();
    d.groups.forEach((g, groupOrder) => {
      const groupId = newId();
      groupIdByTempId.set(g.tempId, groupId);
      groups.push({ id: groupId, planId: plan.id, dayId: day.id, type: g.type, order: groupOrder, label: g.label });
    });

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
        targetTime: e.targetTime,
        targetRest: e.targetRest,
        notes: e.notes,
        groupId: e.groupTempId ? (groupIdByTempId.get(e.groupTempId) ?? null) : null,
        archived: false,
      });
      diffSummary.push({ kind: 'new', dayLabel: d.label, exerciseName: e.name });
    });
  });

  const version: PlanVersion = {
    id: newId(),
    planId: plan.id,
    importedAt: plan.importDate,
    sourceModifiedTime: plan.sourceModifiedTime,
    diffSummary,
  };

  await db.transaction('rw', db.plans, db.planDays, db.exercises, db.exerciseGroups, db.planVersions, async () => {
    const existing = await db.plans.toArray();
    await Promise.all(existing.filter((p) => p.isActive).map((p) => db.plans.update(p.id, { isActive: false })));
    await db.plans.add(plan);
    await db.planDays.bulkAdd(days);
    await db.exercises.bulkAdd(exercises);
    if (groups.length > 0) await db.exerciseGroups.bulkAdd(groups);
    await db.planVersions.add(version);
  });

  return plan;
}

export async function getActivePlan(): Promise<Plan | undefined> {
  const plans = await db.plans.toArray();
  return plans.find((p) => p.isActive);
}

export async function getPlan(planId: string): Promise<Plan | undefined> {
  return db.plans.get(planId);
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
  const groups = await db.exerciseGroups.where('planId').equals(planId).toArray();
  const sessions = await db.sessions.where('planId').equals(planId).toArray();
  const sessionIds = sessions.map((s) => s.id);
  const loggedSets = await db.loggedSets.where('sessionId').anyOf(sessionIds).toArray();
  const versions = await db.planVersions.where('planId').equals(planId).toArray();
  const pending = await db.pendingSyncs.where('planId').equals(planId).toArray();

  await db.transaction(
    'rw',
    [db.plans, db.planDays, db.exercises, db.exerciseGroups, db.sessions, db.loggedSets, db.planVersions, db.pendingSyncs],
    async () => {
      await db.loggedSets.bulkDelete(loggedSets.map((s) => s.id));
      await db.sessions.bulkDelete(sessionIds);
      await db.exercises.bulkDelete(exerciseIds);
      await db.exerciseGroups.bulkDelete(groups.map((g) => g.id));
      await db.planDays.bulkDelete(dayIds);
      await db.planVersions.bulkDelete(versions.map((v) => v.id));
      await db.pendingSyncs.bulkDelete(pending.map((p) => p.id));
      await db.plans.delete(planId);
    },
  );
}

export async function getPlanDays(planId: string, opts: { includeArchived?: boolean } = {}): Promise<PlanDay[]> {
  const days = await db.planDays.where('planId').equals(planId).toArray();
  const filtered = opts.includeArchived ? days : days.filter((d) => !d.archived);
  return filtered.sort((a, b) => a.order - b.order);
}

export async function getExercisesForDay(dayId: string, opts: { includeArchived?: boolean } = {}): Promise<Exercise[]> {
  const exs = await db.exercises.where('dayId').equals(dayId).toArray();
  const filtered = opts.includeArchived ? exs : exs.filter((e) => !e.archived);
  return filtered.sort((a, b) => a.order - b.order);
}

export async function getExerciseGroupsForDay(dayId: string): Promise<ExerciseGroup[]> {
  const groups = await db.exerciseGroups.where('dayId').equals(dayId).toArray();
  return groups.sort((a, b) => a.order - b.order);
}

/** Writes one or more cloned copies of `dayId` into the plan, inserted right after it, and renumbers every day's `order` to match the final sequence. */
async function insertClonedDays(planId: string, afterDayId: string, clones: { week: number; label: string }[]): Promise<void> {
  const days = await getPlanDays(planId);
  const idx = days.findIndex((d) => d.id === afterDayId);
  if (idx === -1) return;

  const sourceExercises = await getExercisesForDay(afterDayId);
  const sourceGroups = await getExerciseGroupsForDay(afterDayId);

  const newDays: PlanDay[] = [];
  const newExercises: Exercise[] = [];
  const newGroups: ExerciseGroup[] = [];

  for (const clone of clones) {
    const newDayId = newId();
    const groupIdMap = new Map<string, string>();
    sourceGroups.forEach((g) => {
      const gid = newId();
      groupIdMap.set(g.id, gid);
      newGroups.push({ ...g, id: gid, dayId: newDayId });
    });
    sourceExercises.forEach((e) => {
      newExercises.push({
        ...e,
        id: newId(),
        dayId: newDayId,
        groupId: e.groupId ? (groupIdMap.get(e.groupId) ?? null) : null,
        archived: false,
      });
    });
    newDays.push({ id: newDayId, planId, week: clone.week, order: 0, label: clone.label, archived: false });
  }

  const finalOrder = [...days.slice(0, idx + 1), ...newDays, ...days.slice(idx + 1)];

  await db.transaction('rw', db.planDays, db.exercises, db.exerciseGroups, async () => {
    await db.planDays.bulkAdd(newDays);
    if (newExercises.length > 0) await db.exercises.bulkAdd(newExercises);
    if (newGroups.length > 0) await db.exerciseGroups.bulkAdd(newGroups);
    await Promise.all(finalOrder.map((d, i) => db.planDays.update(d.id, { order: i })));
  });
}

/** Duplicates a saved day (with its exercises and groups) immediately after itself, same week. */
export async function duplicateDayInDb(planId: string, dayId: string): Promise<void> {
  const day = await db.planDays.get(dayId);
  if (!day) return;
  await insertClonedDays(planId, dayId, [{ week: day.week, label: `${day.label} (copy)` }]);
}

/** Clones a saved day across `weekCount` additional weeks, inserted right after it. */
export async function repeatDayInDb(planId: string, dayId: string, weekCount: number): Promise<void> {
  const day = await db.planDays.get(dayId);
  if (!day) return;
  const clones = Array.from({ length: weekCount }, (_, i) => ({ week: day.week + 1 + i, label: day.label }));
  await insertClonedDays(planId, dayId, clones);
}

export async function getExercisesForPlan(planId: string, opts: { includeArchived?: boolean } = {}): Promise<Exercise[]> {
  const exs = await db.exercises.where('planId').equals(planId).toArray();
  return opts.includeArchived ? exs : exs.filter((e) => !e.archived);
}

export async function getExerciseGroupsForPlan(planId: string): Promise<ExerciseGroup[]> {
  return db.exerciseGroups.where('planId').equals(planId).toArray();
}

/**
 * Applies a due "next cycle" pending sync (if any) before the cycle wraps
 * back to day 0 — the boundary the review screen's "apply from next cycle"
 * choice promised. A no-op if there's nothing pending or the boundary
 * hasn't been reached yet.
 */
export async function checkAndApplyPendingSync(planId: string): Promise<void> {
  const pending = await db.pendingSyncs.where('planId').equals(planId).first();
  if (!pending || pending.dayCountAtCreation <= 0) return;

  const finishedCount = await db.sessions
    .where('planId')
    .equals(planId)
    .filter((s) => s.status === 'completed' || s.status === 'skipped')
    .count();

  if (finishedCount > 0 && finishedCount % pending.dayCountAtCreation === 0) {
    await runApplyPlan(pending.payload as ApplyPlan);
    await db.pendingSyncs.delete(pending.id);
  }
}

/** Determines which PlanDay comes next, cycling through the program in order. */
export async function getNextDay(planId: string): Promise<PlanDay | undefined> {
  await checkAndApplyPendingSync(planId);
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
  timeSeconds: number | null;
  rpe: number | null;
  notes?: string | null;
  targetSetsAtLog: number | null;
  targetRepsAtLog: string | null;
  targetWeightAtLog: string | null;
  targetTimeAtLog: string | null;
  targetRestAtLog: string | null;
}): Promise<LoggedSet> {
  const set: LoggedSet = {
    id: newId(),
    sessionId: input.sessionId,
    exerciseId: input.exerciseId,
    setNumber: input.setNumber,
    reps: input.reps,
    weight: input.weight,
    timeSeconds: input.timeSeconds,
    rpe: input.rpe,
    notes: input.notes ?? null,
    timestamp: Date.now(),
    targetSetsAtLog: input.targetSetsAtLog,
    targetRepsAtLog: input.targetRepsAtLog,
    targetWeightAtLog: input.targetWeightAtLog,
    targetTimeAtLog: input.targetTimeAtLog,
    targetRestAtLog: input.targetRestAtLog,
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

// --- Plan sync (re-import) ---------------------------------------------

export interface ExistingStructure {
  days: PlanDay[];
  exercisesByDay: Map<string, Exercise[]>;
}

/** The current *active* (non-archived) structure to diff a re-import against. */
export async function getExistingStructureForDiff(planId: string): Promise<ExistingStructure> {
  const days = await getPlanDays(planId);
  const exercisesByDay = new Map<string, Exercise[]>();
  await Promise.all(
    days.map(async (d) => {
      exercisesByDay.set(d.id, await getExercisesForDay(d.id));
    }),
  );
  return { days, exercisesByDay };
}

export async function getPlanVersions(planId: string): Promise<PlanVersion[]> {
  const versions = await db.planVersions.where('planId').equals(planId).toArray();
  return versions.sort((a, b) => b.importedAt - a.importedAt);
}

export async function getPendingSync(planId: string): Promise<PendingSync | undefined> {
  return db.pendingSyncs.where('planId').equals(planId).first();
}

/** No structural changes to record — just remembers we've seen this source version so we don't re-prompt. */
export async function markPlanChecked(planId: string, sourceModifiedTime: string | null): Promise<void> {
  await db.plans.update(planId, { sourceModifiedTime });
}

export type SyncTiming = 'immediate' | 'next_cycle';

/**
 * Confirms a reviewed re-import: always records a PlanVersion (the audit
 * trail), and either applies the structural changes right away or stashes
 * them as a PendingSync to land automatically when the plan's cycle next
 * wraps back to day 0.
 */
export async function confirmSync(
  applyPlan: ApplyPlan,
  diffSummary: DiffEntry[],
  timing: SyncTiming,
  sourceModifiedTime: string | null,
): Promise<void> {
  const version: PlanVersion = {
    id: newId(),
    planId: applyPlan.planId,
    importedAt: Date.now(),
    sourceModifiedTime,
    diffSummary,
  };

  await db.planVersions.add(version);
  await db.plans.update(applyPlan.planId, { sourceModifiedTime });

  if (timing === 'immediate') {
    await runApplyPlan(applyPlan);
    return;
  }

  const currentDays = await getPlanDays(applyPlan.planId);
  const pending: PendingSync = {
    id: newId(),
    planId: applyPlan.planId,
    createdAt: Date.now(),
    dayCountAtCreation: currentDays.length,
    payload: applyPlan,
    planVersion: version,
  };
  // Replace any prior pending sync for this plan rather than stacking them.
  const existing = await db.pendingSyncs.where('planId').equals(applyPlan.planId).toArray();
  await db.transaction('rw', db.pendingSyncs, async () => {
    await db.pendingSyncs.bulkDelete(existing.map((p) => p.id));
    await db.pendingSyncs.add(pending);
  });
}
