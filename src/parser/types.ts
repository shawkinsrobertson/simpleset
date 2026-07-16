export interface ParsedExercise {
  tempId: string;
  name: string;
  targetSets: number | null;
  targetReps: string | null;
  targetWeight: string | null;
  notes: string | null;
  /** The raw source line/row this was parsed from, kept for the confirm screen. */
  raw: string;
}

export interface ParsedDay {
  tempId: string;
  week: number;
  label: string;
  exercises: ParsedExercise[];
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
