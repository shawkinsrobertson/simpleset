// Mirrors src/parser/types.ts — kept manually in sync, same as the old
// server/src/types.ts did. Deno Edge Functions deploy as a self-contained
// directory, so this can't just import the frontend's copy directly.

export type ExerciseGroupType = 'circuit' | 'superset';

export interface ParsedGroup {
  tempId: string;
  type: ExerciseGroupType;
  label: string | null;
}

export interface ParsedExercise {
  tempId: string;
  name: string;
  targetSets: number | null;
  targetReps: string | null;
  targetWeight: string | null;
  targetTime: string | null;
  targetRest: string | null;
  notes: string | null;
  groupTempId: string | null;
  raw: string;
}

export interface ParsedDay {
  tempId: string;
  week: number;
  label: string;
  exercises: ParsedExercise[];
  groups: ParsedGroup[];
}

export interface ParsedPlan {
  name: string;
  days: ParsedDay[];
  warnings: string[];
}
