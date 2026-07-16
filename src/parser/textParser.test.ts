import { describe, expect, it } from 'vitest';
import { parsePlanText } from './textParser';

describe('parsePlanText', () => {
  it('parses a simple day-header + exercise-line plan', () => {
    const text = `
My 5-Day Split

Day 1: Push
Bench Press 3x8 135lb
Overhead Press 3x10 65lb
Lateral Raise 3x12x15lb

Day 2: Pull
Deadlift 3x5 225lb
Barbell Row 3x8 135lb
`;
    const plan = parsePlanText(text, 'fallback');
    expect(plan.name).toBe('My 5-Day Split');
    expect(plan.days).toHaveLength(2);
    expect(plan.days[0].label).toMatch(/Day 1/);
    expect(plan.days[0].exercises).toHaveLength(3);
    expect(plan.days[0].exercises[0]).toMatchObject({
      name: 'Bench Press',
      targetSets: 3,
      targetReps: '8',
      targetWeight: '135lb',
    });
    expect(plan.days[1].exercises[1]).toMatchObject({
      name: 'Barbell Row',
      targetSets: 3,
      targetReps: '8',
      targetWeight: '135lb',
    });
  });

  it('handles rep ranges and missing weight (bodyweight)', () => {
    const text = `
Day 1
Pull Ups 4x8-10
Push Ups 3 x 15
`;
    const plan = parsePlanText(text, 'fallback');
    expect(plan.days).toHaveLength(1);
    expect(plan.days[0].exercises[0]).toMatchObject({
      name: 'Pull Ups',
      targetSets: 4,
      targetReps: '8-10',
      targetWeight: null,
    });
    expect(plan.days[0].exercises[1]).toMatchObject({
      name: 'Push Ups',
      targetSets: 3,
      targetReps: '15',
    });
  });

  it('groups by week headers', () => {
    const text = `
Week 1
Day 1: Full Body
Squat 3x5 185lb

Week 2
Day 1: Full Body
Squat 3x5 195lb
`;
    const plan = parsePlanText(text, 'fallback');
    expect(plan.days).toHaveLength(2);
    expect(plan.days[0].week).toBe(1);
    expect(plan.days[1].week).toBe(2);
  });

  it('falls back to short lines as headers and warns on unparseable content', () => {
    const text = `
Leg Day
Some rambling sentence that is not an exercise at all.
`;
    const plan = parsePlanText(text, 'fallback');
    expect(plan.days).toHaveLength(1);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  it('returns a warning and no days for empty input', () => {
    const plan = parsePlanText('', 'fallback');
    expect(plan.days).toHaveLength(0);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });
});
