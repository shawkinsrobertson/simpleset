import { describe, expect, it } from 'vitest';
import { createPlanFromParsed, getPlanDays, repeatDayInDb } from './repo';
import type { ParsedPlan } from '../parser/types';

function id() {
  return crypto.randomUUID();
}

function twoDayPlan(): ParsedPlan {
  return {
    name: 'Repeat Order Plan',
    warnings: [],
    days: [
      {
        tempId: id(),
        week: 1,
        label: 'Day 1: Push',
        groups: [],
        exercises: [{ tempId: id(), name: 'Bench Press', targetSets: 3, targetReps: '8', targetWeight: '135lb', targetTime: null, targetRest: null, notes: null, groupTempId: null, raw: '' }],
      },
      {
        tempId: id(),
        week: 1,
        label: 'Day 2: Pull',
        groups: [],
        exercises: [{ tempId: id(), name: 'Row', targetSets: 3, targetReps: '8', targetWeight: '100lb', targetTime: null, targetRest: null, notes: null, groupTempId: null, raw: '' }],
      },
    ],
  };
}

describe('repeating multiple days across weeks', () => {
  it('lands every day in week-number order, not clustered after its source', async () => {
    const plan = await createPlanFromParsed(twoDayPlan(), { sourceType: 'local', sourceFileName: 'plan.txt' });
    const [day1, day2] = await getPlanDays(plan.id);

    // Repeat Day 1 for 3 weeks, then Day 2 for 1 week — a naive "splice right
    // after the source" implementation would cluster Day 1's three copies
    // before Day 2's copy ever gets sorted in against them.
    await repeatDayInDb(plan.id, day1.id, 3);
    await repeatDayInDb(plan.id, day2.id, 1);

    const days = await getPlanDays(plan.id);
    const weeks = days.map((d) => d.week);
    // The core ask: weeks come out in ascending order, not clustered by
    // whichever day was repeated first.
    expect(weeks).toEqual([...weeks].sort((a, b) => a - b));

    // Weeks 1-2 have both days (Push repeated to week 4, Pull only to week 2).
    expect(days.filter((d) => d.week === 1).map((d) => d.label).sort()).toEqual(['Day 1: Push', 'Day 2: Pull']);
    expect(days.filter((d) => d.week === 2).map((d) => d.label).sort()).toEqual(['Day 1: Push', 'Day 2: Pull']);
    expect(days.filter((d) => d.week === 3).map((d) => d.label)).toEqual(['Day 1: Push']);
    expect(days.filter((d) => d.week === 4).map((d) => d.label)).toEqual(['Day 1: Push']);
    expect(days).toHaveLength(6);
  });
});
