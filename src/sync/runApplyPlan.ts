import { db, newId } from '../db/db';
import type { ApplyPlan } from './applyPlan';

export async function runApplyPlan(plan: ApplyPlan): Promise<void> {
  await db.transaction('rw', db.planDays, db.exercises, async () => {
    const realDayIdByTempId = new Map<string, string>();

    for (const nd of plan.newDays) {
      const realId = newId();
      realDayIdByTempId.set(nd.tempId, realId);
      await db.planDays.add({
        id: realId,
        planId: plan.planId,
        week: nd.week,
        order: nd.order,
        label: nd.label,
        archived: false,
      });
    }

    for (const du of plan.dayUpdates) {
      await db.planDays.update(du.dayId, { week: du.week, order: du.order });
    }

    if (plan.archivedDayIds.length > 0) {
      await Promise.all(plan.archivedDayIds.map((id) => db.planDays.update(id, { archived: true })));
    }

    const resolveDayId = (ex: { dayId?: string; tempDayId?: string }): string => {
      if (ex.dayId) return ex.dayId;
      if (ex.tempDayId) {
        const real = realDayIdByTempId.get(ex.tempDayId);
        if (real) return real;
      }
      throw new Error('Could not resolve destination day for a new exercise during apply.');
    };

    for (const ne of plan.newExercises) {
      await db.exercises.add({
        id: newId(),
        planId: plan.planId,
        dayId: resolveDayId(ne),
        order: ne.order,
        name: ne.name,
        targetSets: ne.targetSets,
        targetReps: ne.targetReps,
        targetWeight: ne.targetWeight,
        targetTime: ne.targetTime,
        targetRest: ne.targetRest,
        notes: ne.notes,
        archived: false,
      });
    }

    for (const eu of plan.exerciseUpdates) {
      await db.exercises.update(eu.exerciseId, {
        order: eu.order,
        name: eu.name,
        targetSets: eu.targetSets,
        targetReps: eu.targetReps,
        targetWeight: eu.targetWeight,
        targetTime: eu.targetTime,
        targetRest: eu.targetRest,
        notes: eu.notes,
      });
    }

    if (plan.archivedExerciseIds.length > 0) {
      await Promise.all(plan.archivedExerciseIds.map((id) => db.exercises.update(id, { archived: true })));
    }
  });
}
