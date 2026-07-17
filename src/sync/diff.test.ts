import { describe, expect, it } from 'vitest';
import { computeDiff, matchDays, similarity } from './diff';
import type { Exercise, PlanDay } from '../db/types';
import type { ParsedDay, ParsedExercise } from '../parser/types';

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
    groupId: null,
    category: 'strength',
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
    groupTempId: null,
    raw: '',
    ...overrides,
  };
}

function pday(overrides: Partial<ParsedDay>): ParsedDay {
  return { tempId: id('pday'), week: 1, label: 'Day', exercises: [], groups: [], ...overrides };
}

describe('matchDays', () => {
  it('matches by label, not position, when a day is inserted', () => {
    const existing = [
      day({ label: 'Day 1: Push', order: 0 }),
      day({ label: 'Day 2: Pull', order: 1 }),
      day({ label: 'Day 3: Legs', order: 2 }),
    ];
    const parsed = [
      pday({ label: 'Day 1: Push' }),
      pday({ label: 'Day 1.5: Core' }), // newly inserted in the middle
      pday({ label: 'Day 2: Pull' }),
      pday({ label: 'Day 3: Legs' }),
    ];
    const matches = matchDays(existing, parsed);
    const matched = matches.filter((m) => m.kind === 'matched');
    const added = matches.filter((m) => m.kind === 'new');
    const removed = matches.filter((m) => m.kind === 'removed');
    expect(matched).toHaveLength(3);
    expect(added).toHaveLength(1);
    expect(added[0].parsedDay?.label).toBe('Day 1.5: Core');
    expect(removed).toHaveLength(0);
    // Identity preserved: matched existing days keep their original ids
    expect(matched.map((m) => m.existingDay?.label).sort()).toEqual(['Day 1: Push', 'Day 2: Pull', 'Day 3: Legs']);
  });

  it('marks a day removed when its label disappears from the new doc', () => {
    const existing = [day({ label: 'Day 1: Push' }), day({ label: 'Day 2: Pull' })];
    const parsed = [pday({ label: 'Day 1: Push' })];
    const matches = matchDays(existing, parsed);
    expect(matches.find((m) => m.kind === 'removed')?.existingDay?.label).toBe('Day 2: Pull');
  });

  it('treats label matching as case/punctuation-insensitive', () => {
    const existing = [day({ label: 'Day 1: Push' })];
    const parsed = [pday({ label: 'day 1 - push' })];
    const matches = matchDays(existing, parsed);
    expect(matches).toHaveLength(1);
    expect(matches[0].kind).toBe('matched');
  });
});

describe('computeDiff — exercise matching', () => {
  it('classifies an untouched exercise as unchanged', () => {
    const d = day({ label: 'Day 1' });
    const existingEx = ex({ dayId: d.id, name: 'Bench Press', targetSets: 3, targetReps: '8', targetWeight: '135lb' });
    const parsed = pday({ label: 'Day 1', exercises: [pex({ name: 'Bench Press', targetSets: 3, targetReps: '8', targetWeight: '135lb' })] });

    const diff = computeDiff([d], new Map([[d.id, [existingEx]]]), { name: 'p', days: [parsed], warnings: [] });
    expect(diff.exerciseMatches).toHaveLength(1);
    expect(diff.exerciseMatches[0].kind).toBe('unchanged');
    expect(diff.exerciseMatches[0].existingExercise?.id).toBe(existingEx.id);
  });

  it('classifies a target change as modified and keeps the same exercise id', () => {
    const d = day({ label: 'Day 1' });
    const existingEx = ex({ dayId: d.id, name: 'Bench Press', targetSets: 3, targetReps: '8', targetWeight: '135lb' });
    const parsed = pday({ label: 'Day 1', exercises: [pex({ name: 'Bench Press', targetSets: 3, targetReps: '10', targetWeight: '145lb' })] });

    const diff = computeDiff([d], new Map([[d.id, [existingEx]]]), { name: 'p', days: [parsed], warnings: [] });
    expect(diff.exerciseMatches[0].kind).toBe('modified');
    expect(diff.exerciseMatches[0].existingExercise?.id).toBe(existingEx.id);
    expect(diff.exerciseMatches[0].detail).toContain('135lb');
    expect(diff.exerciseMatches[0].detail).toContain('145lb');
  });

  it('surfaces a plausible rename as possibly_renamed rather than auto-resolving it', () => {
    const d = day({ label: 'Day 1' });
    const existingEx = ex({ dayId: d.id, name: 'Bench Press' });
    const parsed = pday({ label: 'Day 1', exercises: [pex({ name: 'Barbell Bench Press' })] });

    const diff = computeDiff([d], new Map([[d.id, [existingEx]]]), { name: 'p', days: [parsed], warnings: [] });
    expect(diff.exerciseMatches).toHaveLength(1);
    expect(diff.exerciseMatches[0].kind).toBe('possibly_renamed');
    expect(diff.exerciseMatches[0].existingExercise?.name).toBe('Bench Press');
    expect(diff.exerciseMatches[0].parsedExercise?.name).toBe('Barbell Bench Press');
    expect(diff.exerciseMatches[0].similarity).toBeGreaterThan(0.5);
  });

  it('treats a truly unrelated new+removed pair as such, not a rename candidate', () => {
    const d = day({ label: 'Day 1' });
    const existingEx = ex({ dayId: d.id, name: 'Deadlift' });
    const parsed = pday({ label: 'Day 1', exercises: [pex({ name: 'Lateral Raise' })] });

    const diff = computeDiff([d], new Map([[d.id, [existingEx]]]), { name: 'p', days: [parsed], warnings: [] });
    const kinds = diff.exerciseMatches.map((m) => m.kind).sort();
    expect(kinds).toEqual(['new', 'removed']);
  });

  it('uses position as a tiebreaker for duplicate exercise names in the same day', () => {
    const d = day({ label: 'Day 1' });
    const oldA = ex({ dayId: d.id, name: 'Curl', order: 0, targetWeight: '20lb' });
    const oldB = ex({ dayId: d.id, name: 'Curl', order: 1, targetWeight: '25lb' });
    const parsed = pday({
      label: 'Day 1',
      exercises: [pex({ name: 'Curl', targetWeight: '22lb' }), pex({ name: 'Curl', targetWeight: '27lb' })],
    });

    const diff = computeDiff([d], new Map([[d.id, [oldA, oldB]]]), { name: 'p', days: [parsed], warnings: [] });
    expect(diff.exerciseMatches).toHaveLength(2);
    const forA = diff.exerciseMatches.find((m) => m.existingExercise?.id === oldA.id);
    const forB = diff.exerciseMatches.find((m) => m.existingExercise?.id === oldB.id);
    expect(forA?.parsedExercise?.targetWeight).toBe('22lb');
    expect(forB?.parsedExercise?.targetWeight).toBe('27lb');
  });

  it('marks every exercise in a removed day as removed', () => {
    const d = day({ label: 'Day 3: Legs' });
    const a = ex({ dayId: d.id, name: 'Squat' });
    const b = ex({ dayId: d.id, name: 'Leg Press' });

    const diff = computeDiff([d], new Map([[d.id, [a, b]]]), { name: 'p', days: [], warnings: [] });
    expect(diff.dayMatches[0].kind).toBe('removed');
    expect(diff.exerciseMatches.every((m) => m.kind === 'removed')).toBe(true);
    expect(diff.exerciseMatches).toHaveLength(2);
  });

  it('puts every exercise in a brand new day under "new"', () => {
    const parsed = pday({ label: 'Day 4: Arms', exercises: [pex({ name: 'Bicep Curl' }), pex({ name: 'Tricep Pushdown' })] });
    const diff = computeDiff([], new Map(), { name: 'p', days: [parsed], warnings: [] });
    expect(diff.dayMatches[0].kind).toBe('new');
    expect(diff.exerciseMatches.every((m) => m.kind === 'new')).toBe(true);
  });
});

describe('similarity', () => {
  it('is 1 for identical (normalized) names', () => {
    expect(similarity('Pull-Ups', 'pull ups')).toBe(1);
  });
  it('is low for unrelated names', () => {
    expect(similarity('Deadlift', 'Lateral Raise')).toBeLessThan(0.3);
  });
  it('is high for a superset/rename like relationship', () => {
    expect(similarity('Bench Press', 'Barbell Bench Press')).toBeGreaterThan(0.6);
  });
});
