import { describe, expect, it } from 'vitest';
import { db } from './db';
import {
  checkAndApplyPendingSync,
  completeSession,
  confirmSync,
  createPlanFromParsed,
  getPlanDays,
  startSession,
} from './repo';
import { computeDiff } from '../sync/diff';
import { buildApplyPlan } from '../sync/applyPlan';
import type { ParsedPlan } from '../parser/types';

function planWithTwoDays(): ParsedPlan {
  return {
    name: 'Two Day Plan',
    warnings: [],
    days: [
      {
        tempId: id(),
        week: 1,
        label: 'Day 1: Push',
        exercises: [{ tempId: id(), name: 'Bench Press', targetSets: 3, targetReps: '8', targetWeight: '135lb', targetTime: null, targetRest: null, notes: null, raw: '' }],
      },
      {
        tempId: id(),
        week: 1,
        label: 'Day 2: Pull',
        exercises: [{ tempId: id(), name: 'Row', targetSets: 3, targetReps: '8', targetWeight: '100lb', targetTime: null, targetRest: null, notes: null, raw: '' }],
      },
    ],
  };
}

function id() {
  return crypto.randomUUID();
}

describe('checkAndApplyPendingSync — "apply from next cycle"', () => {
  it('does not apply until the cycle wraps back to day 0, then applies exactly once', async () => {
    const plan = await createPlanFromParsed(planWithTwoDays(), { sourceType: 'local', sourceFileName: 'plan.txt' });
    const days = await getPlanDays(plan.id);
    expect(days).toHaveLength(2);

    // Re-import with a target change on Day 1's exercise.
    const updated: ParsedPlan = {
      name: 'Two Day Plan',
      warnings: [],
      days: [
        { tempId: id(), week: 1, label: 'Day 1: Push', exercises: [{ tempId: id(), name: 'Bench Press', targetSets: 3, targetReps: '10', targetWeight: '145lb', targetTime: null, targetRest: null, notes: null, raw: '' }] },
        { tempId: id(), week: 1, label: 'Day 2: Pull', exercises: [{ tempId: id(), name: 'Row', targetSets: 3, targetReps: '8', targetWeight: '100lb', targetTime: null, targetRest: null, notes: null, raw: '' }] },
      ],
    };
    const existingDays = await getPlanDays(plan.id);
    const exercisesByDay = new Map(
      await Promise.all(
        existingDays.map(async (d) => [d.id, await db.exercises.where('dayId').equals(d.id).toArray()] as const),
      ),
    );
    const diff = computeDiff(existingDays, exercisesByDay, updated);
    const applyPlan = buildApplyPlan(plan.id, diff, {});
    await confirmSync(applyPlan, [], 'next_cycle', 'v2');

    // Structural change must NOT be visible yet — old target still in place.
    const day1Before = existingDays.find((d) => d.label === 'Day 1: Push')!;
    const exBefore = await db.exercises.where('dayId').equals(day1Before.id).first();
    expect(exBefore?.targetReps).toBe('8');

    // Finish day 1 (session count = 1, 1 % 2 !== 0 — cycle not complete yet).
    const s1 = await startSession(plan.id, day1Before.id);
    await completeSession(s1.id);
    await checkAndApplyPendingSync(plan.id);
    let ex = await db.exercises.where('dayId').equals(day1Before.id).first();
    expect(ex?.targetReps).toBe('8'); // still old — cycle not wrapped

    // Finish day 2 (session count = 2, 2 % 2 === 0 — cycle just wrapped).
    const day2 = existingDays.find((d) => d.label === 'Day 2: Pull')!;
    const s2 = await startSession(plan.id, day2.id);
    await completeSession(s2.id);
    await checkAndApplyPendingSync(plan.id);
    ex = await db.exercises.where('dayId').equals(day1Before.id).first();
    expect(ex?.targetReps).toBe('10'); // now applied

    // Pending sync is consumed — re-running is a safe no-op.
    const pendingAfter = await db.pendingSyncs.where('planId').equals(plan.id).toArray();
    expect(pendingAfter).toHaveLength(0);
  });
});
