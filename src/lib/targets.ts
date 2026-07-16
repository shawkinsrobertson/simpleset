/** Best-effort numeric guess from a free-form target string, used to prefill the logging UI. */
export function guessRepsFromTarget(targetReps: string | null): number | null {
  if (!targetReps) return null;
  const match = /\d+/.exec(targetReps);
  return match ? Number(match[0]) : null;
}

export function guessWeightFromTarget(targetWeight: string | null): number | null {
  if (!targetWeight) return null;
  const match = /[\d.]+/.exec(targetWeight);
  return match ? Number(match[0]) : null;
}

/** Parses a free-form duration target ("30s", "1min", "1.5 min") into whole seconds. */
export function guessSecondsFromTarget(targetTime: string | null): number | null {
  if (!targetTime) return null;
  const match = /([\d.]+)\s*(s|sec|secs|seconds|min|mins|minutes)?/i.exec(targetTime);
  if (!match) return null;
  const value = Number(match[1]);
  if (Number.isNaN(value)) return null;
  const isMinutes = /^min/i.test(match[2] ?? '');
  return Math.round(isMinutes ? value * 60 : value);
}

/** Formats whole seconds back into a compact display string ("90" -> "1:30", "45" -> "45s"). */
export function formatSeconds(totalSeconds: number | null): string {
  if (totalSeconds == null) return '—';
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
