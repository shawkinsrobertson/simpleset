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

  it('groups a numberless circuit-style exercise list under one ALL-CAPS section instead of fragmenting per line', () => {
    // Regression test: a plan with no per-exercise sets/reps at all (shared
    // circuit timing instead) used to hijack the "new day" heuristic on
    // every single exercise name, turning one section into ~15 bogus
    // one-exercise "days" that mostly got silently dropped.
    const text = `
Bodyweight Plan

WARM-UP
World's Greatest Stretch
Pike Fold to Squat Hold
Butterfly Bridge to Draw-In

MAIN SET
Incline Pushup
Scarecrows
Box Squat
Single Leg DL

COOL DOWN
Child's Pose
Down Dog Pedal and Reach
`;
    const plan = parsePlanText(text, 'fallback');
    expect(plan.days).toHaveLength(3);
    expect(plan.days.map((d) => d.label)).toEqual(['WARM-UP', 'MAIN SET', 'COOL DOWN']);
    expect(plan.days[0].exercises.map((e) => e.name)).toEqual([
      "World's Greatest Stretch",
      'Pike Fold to Squat Hold',
      'Butterfly Bridge to Draw-In',
    ]);
    expect(plan.days[1].exercises).toHaveLength(4);
    expect(plan.days[2].exercises).toHaveLength(2);
    // All exercises without targets now produce one consolidated warning.
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]).toMatch(/9 exercises couldn't be matched/);
  });

  it('still promotes a short plain-case line to a new day when nothing is open yet', () => {
    const text = `
My Plan
Push Day
Bench Press 3x8 135lb
`;
    const plan = parsePlanText(text, 'fallback');
    expect(plan.days).toHaveLength(1);
    expect(plan.days[0].label).toBe('Push Day');
  });

  it('parses "sets x duration" as a timed exercise, not reps', () => {
    const text = `
Day 1
Plank 3x30s
Wall Sit 3 x 45 sec
`;
    const plan = parsePlanText(text, 'fallback');
    expect(plan.days[0].exercises[0]).toMatchObject({
      name: 'Plank',
      targetSets: 3,
      targetReps: null,
      targetTime: '30s',
    });
    expect(plan.days[0].exercises[1]).toMatchObject({
      name: 'Wall Sit',
      targetSets: 3,
      targetTime: '45s',
    });
  });

  it('parses a bare duration with no sets multiplier', () => {
    const text = `
Day 1
Dead Hang 45s
Side Plank 1min hold
`;
    const plan = parsePlanText(text, 'fallback');
    expect(plan.days[0].exercises[0]).toMatchObject({
      name: 'Dead Hang',
      targetSets: null,
      targetTime: '45s',
    });
    expect(plan.days[0].exercises[1]).toMatchObject({
      name: 'Side Plank',
      targetTime: '1min',
    });
  });

  it('extracts an inline rest mention into targetRest, separate from notes', () => {
    const text = `
Day 1
Plank 3x30s, 30s rest
Bench Press 3x8 135lb - rest 90s
`;
    const plan = parsePlanText(text, 'fallback');
    expect(plan.days[0].exercises[0]).toMatchObject({
      name: 'Plank',
      targetTime: '30s',
      targetRest: '30s',
      notes: null,
    });
    expect(plan.days[0].exercises[1]).toMatchObject({
      name: 'Bench Press',
      targetWeight: '135lb',
      targetRest: '90s',
      notes: null,
    });
  });

  it('does not misread "3x30s" as 30 reps with a stray unit', () => {
    // Regression guard for the sets/reps regex vs. sets/time regex ordering.
    const text = `
Day 1
Squat Hold 3x30s
`;
    const plan = parsePlanText(text, 'fallback');
    expect(plan.days[0].exercises[0].targetReps).toBeNull();
    expect(plan.days[0].exercises[0].targetTime).toBe('30s');
  });

  // ---- New format coverage ----

  it('parses "3 sets x 8 reps" verbose notation', () => {
    const text = `
Day 1
Bench Press 3 sets x 8 reps 135lb
Squat 4 sets x 5 reps 185lb
`;
    const plan = parsePlanText(text, 'fallback');
    expect(plan.days[0].exercises[0]).toMatchObject({
      name: 'Bench Press',
      targetSets: 3,
      targetReps: '8',
      targetWeight: '135lb',
    });
    expect(plan.days[0].exercises[1]).toMatchObject({
      name: 'Squat',
      targetSets: 4,
      targetReps: '5',
      targetWeight: '185lb',
    });
  });

  it('parses "3 sets of 8-10 reps" verbose notation with rep range', () => {
    const text = `
Day 1
Romanian Deadlift 3 sets of 8-10 reps 95lb
`;
    const plan = parsePlanText(text, 'fallback');
    expect(plan.days[0].exercises[0]).toMatchObject({
      name: 'Romanian Deadlift',
      targetSets: 3,
      targetReps: '8-10',
      targetWeight: '95lb',
    });
  });

  it('parses "failure" and "to failure" as rep targets', () => {
    const text = `
Day 1
Pull Ups 3x failure
Push Ups 2 sets x to failure
Dips 3 sets of failure
`;
    const plan = parsePlanText(text, 'fallback');
    expect(plan.days[0].exercises[0]).toMatchObject({
      name: 'Pull Ups',
      targetSets: 3,
      targetReps: 'failure',
    });
    expect(plan.days[0].exercises[1]).toMatchObject({
      name: 'Push Ups',
      targetSets: 2,
      targetReps: 'failure',
    });
    expect(plan.days[0].exercises[2]).toMatchObject({
      name: 'Dips',
      targetSets: 3,
      targetReps: 'failure',
    });
  });

  it('parses standalone AMRAP without sets multiplier', () => {
    const text = `
Day 1
Burpees AMRAP
`;
    const plan = parsePlanText(text, 'fallback');
    expect(plan.days[0].exercises[0]).toMatchObject({
      name: 'Burpees',
      targetSets: null,
      targetReps: 'amrap',
    });
  });

  it('parses "8-10 reps" standalone (reps-only line, no sets)', () => {
    const text = `
Day 1
Chin Ups 8-10 reps
Leg Raise 15 reps
`;
    const plan = parsePlanText(text, 'fallback');
    expect(plan.days[0].exercises[0]).toMatchObject({
      name: 'Chin Ups',
      targetSets: null,
      targetReps: '8-10',
    });
    expect(plan.days[0].exercises[1]).toMatchObject({
      name: 'Leg Raise',
      targetSets: null,
      targetReps: '15',
    });
  });

  it('parses AMRAP with a sets multiplier', () => {
    const text = `
Day 1
Kettlebell Swings 3 x AMRAP
`;
    const plan = parsePlanText(text, 'fallback');
    expect(plan.days[0].exercises[0]).toMatchObject({
      name: 'Kettlebell Swings',
      targetSets: 3,
      targetReps: 'amrap',
    });
  });

  it('handles "rest between sets" rest format', () => {
    const text = `
Day 1
Squat 5x5 225lb, rest between sets: 3min
`;
    const plan = parsePlanText(text, 'fallback');
    expect(plan.days[0].exercises[0]).toMatchObject({
      name: 'Squat',
      targetSets: 5,
      targetReps: '5',
      targetWeight: '225lb',
      targetRest: '3min',
    });
  });

  it('handles "w/ Xs rest" rest format', () => {
    const text = `
Day 1
Bench Press 4x6 185lb w/ 90s rest
`;
    const plan = parsePlanText(text, 'fallback');
    expect(plan.days[0].exercises[0]).toMatchObject({
      name: 'Bench Press',
      targetRest: '90s',
    });
  });

  it('normalises rep strings — strips extra whitespace around range dash', () => {
    const text = `
Day 1
Cable Row 3 x 10 - 12
`;
    const plan = parsePlanText(text, 'fallback');
    expect(plan.days[0].exercises[0]).toMatchObject({
      name: 'Cable Row',
      targetSets: 3,
      targetReps: '10-12',
    });
  });
});
