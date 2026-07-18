import { describe, expect, it } from 'vitest';
import { formatSeconds, guessRepsFromTarget, guessSecondsFromTarget, guessWeightFromTarget } from './targets';

describe('guessSecondsFromTarget', () => {
  it('parses unit-suffixed durations', () => {
    expect(guessSecondsFromTarget('30s')).toBe(30);
    expect(guessSecondsFromTarget('45 sec')).toBe(45);
    expect(guessSecondsFromTarget('1min')).toBe(60);
    expect(guessSecondsFromTarget('1.5 min')).toBe(90);
  });

  it('parses M:SS colon notation', () => {
    expect(guessSecondsFromTarget('1:30')).toBe(90);
    expect(guessSecondsFromTarget('0:45')).toBe(45);
    expect(guessSecondsFromTarget('2:05')).toBe(125);
  });

  it('returns null for empty input', () => {
    expect(guessSecondsFromTarget(null)).toBeNull();
    expect(guessSecondsFromTarget('')).toBeNull();
  });
});

describe('formatSeconds', () => {
  it('formats sub-minute durations as seconds', () => {
    expect(formatSeconds(45)).toBe('45s');
  });

  it('formats minute-plus durations as M:SS', () => {
    expect(formatSeconds(90)).toBe('1:30');
    expect(formatSeconds(125)).toBe('2:05');
  });

  it('round-trips through guessSecondsFromTarget', () => {
    expect(guessSecondsFromTarget(formatSeconds(90))).toBe(90);
  });

  it('returns a placeholder for null', () => {
    expect(formatSeconds(null)).toBe('—');
  });
});

describe('guessRepsFromTarget', () => {
  it('extracts the leading number', () => {
    expect(guessRepsFromTarget('8-10')).toBe(8);
    expect(guessRepsFromTarget(null)).toBeNull();
  });
});

describe('guessWeightFromTarget', () => {
  it('extracts the leading number, including decimals', () => {
    expect(guessWeightFromTarget('135')).toBe(135);
    expect(guessWeightFromTarget('47.5 kg')).toBe(47.5);
    expect(guessWeightFromTarget(null)).toBeNull();
  });
});
