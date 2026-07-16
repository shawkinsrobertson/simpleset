/**
 * Shared duration vocabulary — used by both the free-form-text parser
 * (scanning a whole line for a duration mention) and the plan grid's
 * reps/time field (classifying a single typed value), so "what looks like
 * a duration" can never drift between the two.
 */
export const TIME_UNIT_FRAGMENT = '(?:s|sec|secs|seconds|min|mins|minutes)';

/** Matches a duration when it's the *entire* value, e.g. a grid cell containing exactly "30s" or "2 min". */
export const BARE_DURATION_RE = new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*(${TIME_UNIT_FRAGMENT})$`, 'i');

export function formatTime(value: string, unit: string): string {
  return `${value}${/^min/i.test(unit) ? 'min' : 's'}`;
}

/** True if the raw value, taken as a whole, reads as a duration ("30s") rather than a rep count ("8", "8-10", "AMRAP"). */
export function isDurationValue(raw: string): boolean {
  return BARE_DURATION_RE.test(raw.trim());
}

export interface RepsOrTime {
  targetReps: string | null;
  targetTime: string | null;
}

/**
 * Classifies a single merged "reps/time" input: a bare duration ("30s",
 * "2min") becomes a time target, anything else (including rep ranges and
 * "AMRAP") is treated as reps.
 */
export function classifyRepsOrTime(raw: string): RepsOrTime {
  const trimmed = raw.trim();
  if (!trimmed) return { targetReps: null, targetTime: null };
  const match = BARE_DURATION_RE.exec(trimmed);
  if (match) {
    return { targetReps: null, targetTime: formatTime(match[1], match[2]) };
  }
  return { targetReps: trimmed, targetTime: null };
}

/** Inverse of classifyRepsOrTime — what to show in the merged field for an exercise's current targets. */
export function repsOrTimeDisplay(targetReps: string | null, targetTime: string | null): string {
  return targetReps ?? targetTime ?? '';
}
