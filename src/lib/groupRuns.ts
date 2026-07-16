import type { Exercise, ExerciseGroup } from '../db/types';

export interface Run {
  group: ExerciseGroup | null;
  exercises: Exercise[];
}

/** Collapses a day's ordered exercises into runs of consecutive same-group members, for rendering circuit/superset brackets. */
export function groupIntoRuns(exercises: Exercise[], groups: ExerciseGroup[]): Run[] {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const runs: Run[] = [];
  for (const ex of exercises) {
    const g = ex.groupId ? (groupById.get(ex.groupId) ?? null) : null;
    const last = runs.at(-1);
    if (last && (last.group?.id ?? null) === (g?.id ?? null)) {
      last.exercises.push(ex);
    } else {
      runs.push({ group: g, exercises: [ex] });
    }
  }
  return runs;
}
