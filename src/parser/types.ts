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
  /** References a ParsedGroup.tempId within the same day, when this exercise is part of a circuit/superset. */
  groupTempId: string | null;
  /** The raw source line/row this was parsed from, kept for the confirm screen. */
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
  /** Non-fatal issues surfaced to the user on the confirm/edit screen. */
  warnings: string[];
}

export type SupportedFileKind = 'docx' | 'xlsx' | 'pdf' | 'text';

export function detectFileKind(file: File): SupportedFileKind | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) return 'docx';
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'xlsx';
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.txt') || name.endsWith('.csv')) return 'text';
  return null;
}
