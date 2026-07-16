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
