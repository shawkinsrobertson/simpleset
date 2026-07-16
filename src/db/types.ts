export type SourceType = 'local' | 'drive';

export interface Plan {
  id: string;
  name: string;
  sourceType: SourceType;
  sourceFileName?: string;
  sourceFileId?: string; // Drive file id, when sourceType === 'drive'
  importDate: number;
  isActive: boolean;
  /** Raw parsed structure kept for reference / re-import diffing. */
  rawStructure: unknown;
}

export interface PlanDay {
  id: string;
  planId: string;
  week: number;
  /** Sequential position across the whole plan (0-indexed), used to walk the program in order. */
  order: number;
  label: string;
}

export interface Exercise {
  id: string;
  planId: string;
  dayId: string;
  order: number;
  name: string;
  targetSets: number | null;
  targetReps: string | null;
  targetWeight: string | null;
  notes: string | null;
}

export type SessionStatus = 'planned' | 'completed' | 'skipped';

export interface Session {
  id: string;
  planId: string;
  dayId: string;
  date: number;
  status: SessionStatus;
  completedAt: number | null;
}

export interface LoggedSet {
  id: string;
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  reps: number | null;
  weight: number | null;
  rpe: number | null;
  notes: string | null;
  timestamp: number;
}
