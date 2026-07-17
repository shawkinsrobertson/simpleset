import { describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { completeSession, createPlanFromParsed, getExercisesForPlan, getPlanDays, logSet, skipSession, startSession, updateExerciseCategory } from '../db/repo';
import { getCycleProgress, getPersonalRecords, getStreak } from './stats';
import type { ParsedPlan } from '../parser/types';

function id() {
  return crypto.randomUUID();
}

function twoDayPlan(): ParsedPlan {
  return {
    name: 'Stats Plan',
    warnings: [],
    days: [
      {
        tempId: id(),
        week: 1,
        label: 'Day 1',
        groups: [],
        exercises: [
          { tempId: id(), name: 'Bench Press', targetSets: 3, targetReps: '8', targetWeight: '135lb', targetTime: null, targetRest: null, notes: null, groupTempId: null, raw: '' },
          { tempId: id(), name: 'Plank', targetSets: 3, targetReps: null, targetWeight: null, targetTime: '30s', targetRest: null, notes: null, groupTempId: null, raw: '' },
          { tempId: id(), name: '1k Row', targetSets: 1, targetReps: null, targetWeight: null, targetTime: '5min', targetRest: null, notes: null, groupTempId: null, raw: '' },
        ],
      },
      {
        tempId: id(),
        week: 1,
        label: 'Day 2',
        groups: [],
        exercises: [{ tempId: id(), name: 'Row', targetSets: 3, targetReps: '8', targetWeight: '100lb', targetTime: null, targetRest: null, notes: null, groupTempId: null, raw: '' }],
      },
    ],
  };
}

describe('getStreak', () => {
  it('counts consecutive completed sessions back from the most recent, breaking on a skip', async () => {
    const plan = await createPlanFromParsed(twoDayPlan(), { sourceType: 'local', sourceFileName: 'plan.txt' });
    const days = await getPlanDays(plan.id);

    const s1 = await startSession(plan.id, days[0].id);
    await completeSession(s1.id);
    const s2 = await startSession(plan.id, days[1].id);
    await completeSession(s2.id);
    expect(await getStreak(plan.id)).toBe(2);

    const s3 = await startSession(plan.id, days[0].id);
    await skipSession(s3.id);
    expect(await getStreak(plan.id)).toBe(0);

    const s4 = await startSession(plan.id, days[1].id);
    await completeSession(s4.id);
    expect(await getStreak(plan.id)).toBe(1);
  });
});

describe('getCycleProgress', () => {
  it('resets each time a full lap through the plan finishes', async () => {
    const plan = await createPlanFromParsed(twoDayPlan(), { sourceType: 'local', sourceFileName: 'plan.txt' });
    const days = await getPlanDays(plan.id);

    expect(await getCycleProgress(plan.id)).toEqual({ completed: 0, total: 2 });

    const s1 = await startSession(plan.id, days[0].id);
    await completeSession(s1.id);
    expect(await getCycleProgress(plan.id)).toEqual({ completed: 1, total: 2 });

    const s2 = await startSession(plan.id, days[1].id);
    await skipSession(s2.id);
    // lap just wrapped (2 finished sessions, 2 % 2 === 0) — fresh lap, nothing completed yet
    expect(await getCycleProgress(plan.id)).toEqual({ completed: 0, total: 2 });
  });
});

describe('getPersonalRecords', () => {
  it('is higher-is-better for weight, and category-aware for timed exercises', async () => {
    const plan = await createPlanFromParsed(twoDayPlan(), { sourceType: 'local', sourceFileName: 'plan.txt' });
    const days = await getPlanDays(plan.id);
    const exercises = await getExercisesForPlan(plan.id);
    const bench = exercises.find((e) => e.name === 'Bench Press')!;
    const plank = exercises.find((e) => e.name === 'Plank')!;
    const row1k = exercises.find((e) => e.name === '1k Row')!;

    await updateExerciseCategory(row1k.id, 'conditioning');

    const session = await startSession(plan.id, days[0].id);
    for (const weight of [135, 145, 140]) {
      await logSet({
        sessionId: session.id,
        exerciseId: bench.id,
        setNumber: 1,
        reps: 8,
        weight,
        timeSeconds: null,
        rpe: null,
        targetSetsAtLog: null,
        targetRepsAtLog: null,
        targetWeightAtLog: null,
        targetTimeAtLog: null,
        targetRestAtLog: null,
      });
    }
    for (const seconds of [30, 45, 40]) {
      await logSet({
        sessionId: session.id,
        exerciseId: plank.id,
        setNumber: 1,
        reps: null,
        weight: null,
        timeSeconds: seconds,
        rpe: null,
        targetSetsAtLog: null,
        targetRepsAtLog: null,
        targetWeightAtLog: null,
        targetTimeAtLog: null,
        targetRestAtLog: null,
      });
    }
    for (const seconds of [320, 290, 305]) {
      await logSet({
        sessionId: session.id,
        exerciseId: row1k.id,
        setNumber: 1,
        reps: null,
        weight: null,
        timeSeconds: seconds,
        rpe: null,
        targetSetsAtLog: null,
        targetRepsAtLog: null,
        targetWeightAtLog: null,
        targetTimeAtLog: null,
        targetRestAtLog: null,
      });
    }

    const records = await getPersonalRecords(plan.id);
    const benchPr = records.find((r) => r.exerciseName === 'Bench Press')!;
    const plankPr = records.find((r) => r.exerciseName === 'Plank')!;
    const rowPr = records.find((r) => r.exerciseName === '1k Row')!;

    expect(benchPr.display).toBe('145 lb');
    expect(plankPr.display).toBe('45s'); // strength/hold: longer is better
    expect(rowPr.display).toBe('4:50'); // conditioning: shorter is better (290s)
  });
});

describe('db.exercises category migration', () => {
  it('defaults every exercise to strength category', async () => {
    const plan = await createPlanFromParsed(twoDayPlan(), { sourceType: 'local', sourceFileName: 'plan.txt' });
    const exercises = await db.exercises.where('planId').equals(plan.id).toArray();
    expect(exercises.every((e) => e.category === 'strength')).toBe(true);
  });
});
