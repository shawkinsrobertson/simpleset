export type SourceType = 'local' | 'drive';

export interface Plan {
  id: string;
  name: string;
  sourceType: SourceType;
  sourceFileName?: string;
  sourceFileId?: string; // Drive file id, when sourceType === 'drive'
  sourceMimeType?: string; // Drive mimeType, so re-sync knows whether to export as a Doc or Sheet
  importDate: number;
  isActive: boolean;
  /** Raw parsed structure kept for reference / re-import diffing. */
  rawStructure: unknown;
  /**
   * Drive `modifiedTime` (ISO string) or local `File.lastModified` (as a
   * string) as of the last successful sync — lets re-sync checks skip a
   * full export/parse when the source hasn't changed.
   */
  sourceModifiedTime: string | null;
}

export interface PlanDay {
  id: string;
  planId: string;
  week: number;
  /** Sequential position across the whole plan (0-indexed), used to walk the program in order. */
  order: number;
  label: string;
  /**
   * Set when this day disappears from a re-imported source doc. Never
   * hard-deleted — sessions/logged sets still reference it. Excluded from
   * the training cycle and from plan browsing going forward.
   */
  archived: boolean;
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
  /**
   * Set when this exercise disappears from a re-imported source doc (or is
   * resolved as "different exercise" during a rename review). Never
   * hard-deleted — logged sets still reference it and remain queryable in
   * Stats.
   */
  archived: boolean;
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
  /**
   * Snapshot of the exercise's target at the moment this set was logged.
   * Never bound live to Exercise.target* — if the plan changes later
   * (re-sync), historical logs must not silently change meaning.
   */
  targetSetsAtLog: number | null;
  targetRepsAtLog: string | null;
  targetWeightAtLog: string | null;
}

/** One row per import/re-import of a plan — an audit trail and undo path. */
export interface PlanVersion {
  id: string;
  planId: string;
  importedAt: number;
  sourceModifiedTime: string | null;
  diffSummary: DiffEntry[];
}

export type DiffKind = 'unchanged' | 'modified' | 'new' | 'possibly_renamed' | 'removed';

export interface DiffEntry {
  kind: DiffKind;
  dayLabel: string;
  exerciseName: string;
  /** Human-readable description of what changed, e.g. "3x8 135lb -> 3x10 145lb". */
  detail?: string;
}

/**
 * A fully-resolved diff whose DB writes are deferred until the plan's
 * training cycle wraps back to day 0 ("apply from next cycle" timing).
 * Stores the same ApplyPlan payload that "apply immediately" would run
 * right away, just executed later.
 */
export interface PendingSync {
  id: string;
  planId: string;
  createdAt: number;
  /** Number of days in the cycle at the time this was queued — the cycle boundary to watch for. */
  dayCountAtCreation: number;
  payload: unknown; // ApplyPlan, kept as unknown here to avoid a sync/db import cycle
  planVersion: PlanVersion;
}
