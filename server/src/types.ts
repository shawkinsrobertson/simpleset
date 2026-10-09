/**
 * Mirrors src/parser/types.ts on the frontend — kept in sync by hand. This
 * is the "standard format" the AI parsing call must produce; everything
 * downstream of parsing (the Confirm/edit grid, the diff/sync engine) only
 * ever consumes this shape, regardless of which path produced it.
 */

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
