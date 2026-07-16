import { describe, expect, it } from 'vitest';
import { computeDiff } from './diff';
import { buildApplyPlan } from './applyPlan';
import { runApplyPlan } from './runApplyPlan';
import { db } from '../db/db';
import type { Exercise, PlanDay } from '../db/types';
import type { ParsedDay, ParsedExercise, ParsedPlan } from '../parser/types';

let uid = 0;
function id(prefix: string): string {
  uid += 1;
  return `${prefix}-${uid}`;
}

function day(overrides: Partial<PlanDay>): PlanDay {
  return { id: id('day'), planId: 'plan-1', week: 1, order: 0, label: 'Day', archived: false, ...overrides };
}
function ex(overrides: Partial<Exercise>): Exercise {
  return {
    id: id('ex'),
    planId: 'plan-1',
    dayId: 'day-1',
    order: 0,
    name: 'Exercise',
    targetSets: 3,
    targetReps: '8',
    targetWeight: '100lb',
    targetTime: null,
    targetRest: null,
    notes: null,
    archived: false,
    ...overrides,
  };
}
function pex(overrides: Partial<ParsedExercise>): ParsedExercise {
  return {
    tempId: id('pex'),
    name: 'Exercise',
    targetSets: 3,
    targetReps: '8',
    targetWeight: '100lb',
    targetTime: null,
    targetRest: null,
    notes: null,
    raw: '',
    ...overrides,
  };
}
function pday(overrides: Partial<ParsedDay>): ParsedDay {
  return { tempId: id('pday'), week: 1, label: 'Day', exercises: [], ...overrides };
}

describe('buildApplyPlan', () => {
  it('throws if a possibly_renamed match is left unresolved', () => {
    const d = day({ label: 'Day 1' });
    const existingEx = ex({ dayId: d.id, name: 'Bench Press' });
    const parsed = pday({ label: 'Day 1', exercises: [pex({ name: 'Barbell Bench Press' })] });
    const diff = computeDiff([d], new Map([[d.id, [existingEx]]]), { name: 'p', days: [parsed], warnings: [] });

    expect(() => buildApplyPlan('plan-1', diff, {})).toThrow(/Unresolved rename/);
  });

  it('resolves "same" as an in-place rename+retarget, keeping the exercise id', () => {
    const d = day({ label: 'Day 1' });
    const existingEx = ex({ dayId: d.id, name: 'Bench Press', targetWeight: '135lb' });
    const parsed = pday({ label: 'Day 1', exercises: [pex({ name: 'Barbell Bench Press', targetWeight: '145lb' })] });
    const diff = computeDiff([d], new Map([[d.id, [existingEx]]]), { name: 'p', days: [parsed], warnings: [] });

    const plan = buildApplyPlan('plan-1', diff, { [existingEx.id]: 'same' });
    expect(plan.exerciseUpdates).toHaveLength(1);
    expect(plan.exerciseUpdates[0].exerciseId).toBe(existingEx.id);
    expect(plan.exerciseUpdates[0].name).toBe('Barbell Bench Press');
    expect(plan.exerciseUpdates[0].targetWeight).toBe('145lb');
    expect(plan.archivedExerciseIds).toHaveLength(0);
    expect(plan.newExercises).toHaveLength(0);
  });

  it('resolves "different" as archive-old + create-new', () => {
    const d = day({ label: 'Day 1' });
    const existingEx = ex({ dayId: d.id, name: 'Bench Press' });
    const parsed = pday({ label: 'Day 1', exercises: [pex({ name: 'Barbell Bench Press' })] });
    const diff = computeDiff([d], new Map([[d.id, [existingEx]]]), { name: 'p', days: [parsed], warnings: [] });

    const plan = buildApplyPlan('plan-1', diff, { [existingEx.id]: 'different' });
    expect(plan.archivedExerciseIds).toEqual([existingEx.id]);
    expect(plan.newExercises).toHaveLength(1);
    expect(plan.newExercises[0].name).toBe('Barbell Bench Press');
    expect(plan.newExercises[0].dayId).toBe(d.id);
  });

  it('resolves a brand new exercise added to an already-matched (existing) day', async () => {
    const d = day({ label: 'Day 1: Push', planId: 'plan-existing-day-new-ex' });
    const existingEx = ex({ dayId: d.id, planId: 'plan-existing-day-new-ex', name: 'Bench Press' });
    const parsed = pday({
      label: 'Day 1: Push',
      exercises: [pex({ name: 'Bench Press' }), pex({ name: 'Skull Crusher' })],
    });
    const diff = computeDiff([d], new Map([[d.id, [existingEx]]]), { name: 'p', days: [parsed], warnings: [] });

    const plan = buildApplyPlan('plan-existing-day-new-ex', diff, {});
    expect(plan.newExercises).toHaveLength(1);
    expect(plan.newExercises[0].name).toBe('Skull Crusher');
    // Must resolve directly to the existing day's real id, not a tempId.
    expect(plan.newExercises[0].dayId).toBe(d.id);
    expect(plan.newExercises[0].tempDayId).toBeUndefined();

    await runApplyPlan(plan);
    const created = await db.exercises.where('planId').equals('plan-existing-day-new-ex').and((e) => e.name === 'Skull Crusher').toArray();
    expect(created).toHaveLength(1);
    expect(created[0].dayId).toBe(d.id);
  });

  it('routes new-day exercises through a tempId resolved by runApplyPlan', async () => {
    const parsedNewDay = pday({ label: 'Day 4: Arms', exercises: [pex({ name: 'Bicep Curl' }), pex({ name: 'Tricep Pushdown' })] });
    const parsedPlan: ParsedPlan = { name: 'p', days: [parsedNewDay], warnings: [] };
    const diff = computeDiff([], new Map(), parsedPlan);
    const plan = buildApplyPlan('plan-test-newday', diff, {});

    expect(plan.newDays).toHaveLength(1);
    expect(plan.newExercises).toHaveLength(2);
    expect(plan.newExercises.every((e) => e.tempDayId === plan.newDays[0].tempId)).toBe(true);

    await runApplyPlan(plan);

    const createdDays = await db.planDays.where('planId').equals('plan-test-newday').toArray();
    expect(createdDays).toHaveLength(1);
    const createdExercises = await db.exercises.where('planId').equals('plan-test-newday').toArray();
    expect(createdExercises).toHaveLength(2);
    expect(createdExercises.every((e) => e.dayId === createdDays[0].id)).toBe(true);
  });
});
