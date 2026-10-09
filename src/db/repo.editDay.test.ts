import { describe, expect, it } from 'vitest';
import { db } from './db';
import {
  archiveExerciseInDb,
  createPlanFromParsed,
  duplicateExerciseInDb,
  getExerciseGroupsForDay,
  getExercisesForDay,
  getPlanDays,
  groupExercisesInDb,
  insertExerciseInDayInDb,
  reorderExercisesInDb,
  ungroupExercisesInDb,
  updateDayInDb,
  updateExerciseInDb,
} from './repo';
import type { ParsedPlan } from '../parser/types';

function id() {
  return crypto.randomUUID();
}

function threeExercisePlan(): ParsedPlan {
  return {
    name: 'Edit Day Plan',
    warnings: [],
    days: [
      {
        tempId: id(),
        week: 1,
        label: 'Day 1: Push',
        groups: [],
        exercises: [
          { tempId: id(), name: 'Bench Press', targetSets: 3, targetReps: '8', targetWeight: '135lb', targetTime: null, targetRest: null, notes: null, groupTempId: null, raw: '' },
          { tempId: id(), name: 'Overhead Press', targetSets: 3, targetReps: '10', targetWeight: '65lb', targetTime: null, targetRest: null, notes: null, groupTempId: null, raw: '' },
          { tempId: id(), name: 'Triceps Pushdown', targetSets: 3, targetReps: '12', targetWeight: '40lb', targetTime: null, targetRest: null, notes: null, groupTempId: null, raw: '' },
        ],
      },
    ],
  };
}

async function seedDay() {
  const plan = await createPlanFromParsed(threeExercisePlan(), { sourceType: 'local', sourceFileName: 'plan.txt' });
  const [day] = await getPlanDays(plan.id);
  const exercises = await getExercisesForDay(day.id);
  return { plan, day, exercises };
}

describe('updateDayInDb / updateExerciseInDb', () => {
  it('edits a day label/week and an exercise field in place', async () => {
    const { day, exercises } = await seedDay();
    await updateDayInDb(day.id, { label: 'Day 1: Chest', week: 2 });
    await updateExerciseInDb(exercises[0].id, { targetWeight: '145lb' });

    const updatedDay = await db.planDays.get(day.id);
    expect(updatedDay?.label).toBe('Day 1: Chest');
    expect(updatedDay?.week).toBe(2);

    const updatedEx = await db.exercises.get(exercises[0].id);
    expect(updatedEx?.targetWeight).toBe('145lb');
  });
});

describe('insertExerciseInDayInDb', () => {
  it('inserts a blank exercise at the right position and reindexes everything after it', async () => {
    const { plan, day, exercises } = await seedDay();
    await insertExerciseInDayInDb(plan.id, day.id, exercises[0].id);

    const after = await getExercisesForDay(day.id);
    expect(after).toHaveLength(4);
    expect(after.map((e) => e.name)).toEqual(['Bench Press', '', 'Overhead Press', 'Triceps Pushdown']);
    expect(after.map((e) => e.order)).toEqual([0, 1, 2, 3]);
  });

  it('inserts at the start when afterExerciseId is null', async () => {
    const { plan, day } = await seedDay();
    await insertExerciseInDayInDb(plan.id, day.id, null);

    const after = await getExercisesForDay(day.id);
    expect(after.map((e) => e.name)).toEqual(['', 'Bench Press', 'Overhead Press', 'Triceps Pushdown']);
  });
});

describe('duplicateExerciseInDb', () => {
  it('clones a row right after itself, reindexing everything after it', async () => {
    const { day, exercises } = await seedDay();
    await duplicateExerciseInDb(exercises[0].id);

    const after = await getExercisesForDay(day.id);
    expect(after).toHaveLength(4);
    expect(after.map((e) => e.name)).toEqual(['Bench Press', 'Bench Press', 'Overhead Press', 'Triceps Pushdown']);
    expect(after[1].id).not.toBe(exercises[0].id); // a real clone, not the same row
    expect(after.map((e) => e.order)).toEqual([0, 1, 2, 3]);
  });
});

describe('archiveExerciseInDb', () => {
  it('archives rather than hard-deletes, excludes it from getExercisesForDay, and reindexes the rest', async () => {
    const { day, exercises } = await seedDay();
    await archiveExerciseInDb(exercises[1].id);

    const active = await getExercisesForDay(day.id);
    expect(active.map((e) => e.name)).toEqual(['Bench Press', 'Triceps Pushdown']);
    expect(active.map((e) => e.order)).toEqual([0, 1]);

    const archived = await db.exercises.get(exercises[1].id);
    expect(archived?.archived).toBe(true); // still in the DB, just archived
  });
});

describe('reorderExercisesInDb', () => {
  it('persists a new exercise order within a day', async () => {
    const { day, exercises } = await seedDay();
    const [bench, ohp, triceps] = exercises;
    await reorderExercisesInDb([triceps.id, bench.id, ohp.id]);

    const after = await getExercisesForDay(day.id);
    expect(after.map((e) => e.name)).toEqual(['Triceps Pushdown', 'Bench Press', 'Overhead Press']);
  });
});

describe('groupExercisesInDb / ungroupExercisesInDb', () => {
  it('groups exercises into a new circuit/superset, then ungroups them', async () => {
    const { plan, day, exercises } = await seedDay();
    const [bench, ohp] = exercises;

    await groupExercisesInDb(plan.id, day.id, [bench.id, ohp.id], 'superset');

    const groups = await getExerciseGroupsForDay(day.id);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('superset');

    const benchGrouped = await db.exercises.get(bench.id);
    const ohpGrouped = await db.exercises.get(ohp.id);
    expect(benchGrouped?.groupId).toBe(groups[0].id);
    expect(ohpGrouped?.groupId).toBe(groups[0].id);

    await ungroupExercisesInDb(groups[0].id);

    const groupsAfter = await getExerciseGroupsForDay(day.id);
    expect(groupsAfter).toHaveLength(0);
    const benchUngrouped = await db.exercises.get(bench.id);
    const ohpUngrouped = await db.exercises.get(ohp.id);
    expect(benchUngrouped?.groupId).toBeNull();
    expect(ohpUngrouped?.groupId).toBeNull();
  });
});
