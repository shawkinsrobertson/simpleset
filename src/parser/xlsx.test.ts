import { describe, expect, it } from 'vitest';
import { parseSheetRows } from './xlsx';

describe('parseSheetRows', () => {
  it('parses a structured sheet with standard column names', () => {
    const rows = [
      ['exercise', 'sets', 'reps', 'weight'],
      ['Bench Press', '3', '8', '135lb'],
      ['Squat', '4', '5', '185lb'],
    ];
    const plan = parseSheetRows(rows, 'My Plan');
    expect(plan.days).toHaveLength(1);
    expect(plan.days[0].exercises).toHaveLength(2);
    expect(plan.days[0].exercises[0]).toMatchObject({
      name: 'Bench Press',
      targetSets: 3,
      targetReps: '8',
      targetWeight: '135lb',
    });
  });

  it('recognises "movement" as the exercise column', () => {
    const rows = [
      ['movement', 'sets', 'reps'],
      ['Deadlift', '3', '5'],
    ];
    const plan = parseSheetRows(rows, 'fallback');
    expect(plan.days[0].exercises[0].name).toBe('Deadlift');
  });

  it('recognises "name" as the exercise column', () => {
    const rows = [
      ['name', 'sets', 'reps'],
      ['Pull Up', '4', '8-10'],
    ];
    const plan = parseSheetRows(rows, 'fallback');
    expect(plan.days[0].exercises[0]).toMatchObject({
      name: 'Pull Up',
      targetReps: '8-10',
    });
  });

  it('recognises "exercise name" as the exercise column', () => {
    const rows = [
      ['exercise name', 'sets', 'reps'],
      ['Romanian Deadlift', '3', '10-12'],
    ];
    const plan = parseSheetRows(rows, 'fallback');
    expect(plan.days[0].exercises[0].name).toBe('Romanian Deadlift');
  });

  it('recognises alternative column names: "load", "repetitions", "# sets"', () => {
    const rows = [
      ['exercise', '# sets', 'repetitions', 'load'],
      ['Barbell Row', '4', '8', '115lb'],
    ];
    const plan = parseSheetRows(rows, 'fallback');
    expect(plan.days[0].exercises[0]).toMatchObject({
      name: 'Barbell Row',
      targetSets: 4,
      targetReps: '8',
      targetWeight: '115lb',
    });
  });

  it('groups exercises by day column changes', () => {
    const rows = [
      ['day', 'exercise', 'sets', 'reps'],
      ['Day 1', 'Squat', '3', '5'],
      ['Day 1', 'Bench Press', '3', '8'],
      ['Day 2', 'Deadlift', '4', '5'],
    ];
    const plan = parseSheetRows(rows, 'fallback');
    expect(plan.days).toHaveLength(2);
    expect(plan.days[0].exercises).toHaveLength(2);
    expect(plan.days[1].exercises).toHaveLength(1);
  });

  it('uses "session" column for day grouping', () => {
    const rows = [
      ['session', 'exercise', 'sets', 'reps'],
      ['A', 'Push Up', '3', '15'],
      ['B', 'Pull Up', '4', '8'],
    ];
    const plan = parseSheetRows(rows, 'fallback');
    expect(plan.days).toHaveLength(2);
    expect(plan.days[0].label).toBe('A');
  });

  it('normalises verbose sets cell "3 sets" to numeric 3', () => {
    const rows = [
      ['exercise', 'sets', 'reps'],
      ['Curl', '3 sets', '10'],
    ];
    const plan = parseSheetRows(rows, 'fallback');
    expect(plan.days[0].exercises[0].targetSets).toBe(3);
  });

  it('normalises verbose reps cell "8-10 reps" to "8-10"', () => {
    const rows = [
      ['exercise', 'sets', 'reps'],
      ['Curl', '3', '8-10 reps'],
    ];
    const plan = parseSheetRows(rows, 'fallback');
    expect(plan.days[0].exercises[0].targetReps).toBe('8-10');
  });

  it('normalises weight cell "135 lbs" to "135lb"', () => {
    const rows = [
      ['exercise', 'sets', 'reps', 'weight'],
      ['Bench', '3', '8', '135 lbs'],
    ];
    const plan = parseSheetRows(rows, 'fallback');
    expect(plan.days[0].exercises[0].targetWeight).toBe('135lb');
  });

  it('normalises weight cell "60 kgs" to "60kg"', () => {
    const rows = [
      ['exercise', 'sets', 'reps', 'weight (kg)'],
      ['Deadlift', '3', '5', '60 kgs'],
    ];
    const plan = parseSheetRows(rows, 'fallback');
    expect(plan.days[0].exercises[0].targetWeight).toBe('60kg');
  });

  it('falls back to text parser when no recognisable header row', () => {
    const rows = [
      ['Day 1: Push'],
      ['Bench Press 3x8 135lb'],
    ];
    const plan = parseSheetRows(rows, 'fallback');
    expect(plan.days).toHaveLength(1);
    expect(plan.days[0].exercises[0]).toMatchObject({
      name: 'Bench Press',
      targetSets: 3,
      targetReps: '8',
    });
  });

  it('returns a warning and empty days for an empty spreadsheet', () => {
    const plan = parseSheetRows([], 'fallback');
    expect(plan.days).toHaveLength(0);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  it('warns when exercise has no sets/reps/time', () => {
    const rows = [
      ['exercise', 'sets', 'reps'],
      ['Mystery Move', '', ''],
    ];
    const plan = parseSheetRows(rows, 'fallback');
    // Exercise is still imported — it appears in the day so the user can fill it in.
    expect(plan.days[0].exercises[0].name).toBe('Mystery Move');
    // A warning is emitted about the missing targets.
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  it('recognises "rep range" as the reps column', () => {
    const rows = [
      ['exercise', 'sets', 'rep range'],
      ['Incline Press', '3', '10-15'],
    ];
    const plan = parseSheetRows(rows, 'fallback');
    expect(plan.days[0].exercises[0].targetReps).toBe('10-15');
  });

  it('recognises "duration" as the time column', () => {
    const rows = [
      ['exercise', 'sets', 'duration'],
      ['Plank', '3', '30s'],
    ];
    const plan = parseSheetRows(rows, 'fallback');
    expect(plan.days[0].exercises[0]).toMatchObject({
      name: 'Plank',
      targetSets: 3,
      targetTime: '30s',
    });
  });

  it('recognises "recovery" as the rest column', () => {
    const rows = [
      ['exercise', 'sets', 'reps', 'recovery'],
      ['Squat', '5', '5', '3min'],
    ];
    const plan = parseSheetRows(rows, 'fallback');
    expect(plan.days[0].exercises[0].targetRest).toBe('3min');
  });
});
