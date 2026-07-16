import { describe, expect, it } from 'vitest';
import { classifyRepsOrTime, isDurationValue, repsOrTimeDisplay } from './duration';

describe('classifyRepsOrTime', () => {
  it('classifies a bare duration as time', () => {
    expect(classifyRepsOrTime('30s')).toEqual({ targetReps: null, targetTime: '30s' });
    expect(classifyRepsOrTime('2min')).toEqual({ targetReps: null, targetTime: '2min' });
    expect(classifyRepsOrTime('1.5 minutes')).toEqual({ targetReps: null, targetTime: '1.5min' });
  });

  it('classifies everything else as reps', () => {
    expect(classifyRepsOrTime('8')).toEqual({ targetReps: '8', targetTime: null });
    expect(classifyRepsOrTime('8-10')).toEqual({ targetReps: '8-10', targetTime: null });
    expect(classifyRepsOrTime('AMRAP')).toEqual({ targetReps: 'AMRAP', targetTime: null });
  });

  it('treats an empty value as no target at all', () => {
    expect(classifyRepsOrTime('')).toEqual({ targetReps: null, targetTime: null });
    expect(classifyRepsOrTime('   ')).toEqual({ targetReps: null, targetTime: null });
  });

  it('requires the duration to be the whole value, not just contain one', () => {
    // "8 sets" isn't a duration even though it has digits+letters — reps fallback.
    expect(classifyRepsOrTime('8 sets')).toEqual({ targetReps: '8 sets', targetTime: null });
  });
});

describe('isDurationValue', () => {
  it('matches whole-string durations only', () => {
    expect(isDurationValue('30s')).toBe(true);
    expect(isDurationValue('45 sec')).toBe(true);
    expect(isDurationValue('8-10')).toBe(false);
    expect(isDurationValue('AMRAP')).toBe(false);
  });
});

describe('repsOrTimeDisplay', () => {
  it('prefers reps, falls back to time, then empty', () => {
    expect(repsOrTimeDisplay('8', null)).toBe('8');
    expect(repsOrTimeDisplay(null, '30s')).toBe('30s');
    expect(repsOrTimeDisplay(null, null)).toBe('');
  });
});
