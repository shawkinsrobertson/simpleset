import type { DiffResult, ExerciseMatch } from './diff';

export type RenameResolutions = Record<string, 'same' | 'different'>;

export interface NewDayInstruction {
  tempId: string;
  week: number;
  order: number;
  label: string;
}

export interface DayUpdateInstruction {
  dayId: string;
  week: number;
  order: number;
}

interface ExerciseFields {
  order: number;
  name: string;
  targetSets: number | null;
  targetReps: string | null;
  targetWeight: string | null;
  targetTime: string | null;
  targetRest: string | null;
  notes: string | null;
}

export interface NewExerciseInstruction extends ExerciseFields {
  dayId?: string;
  tempDayId?: string;
}

export interface ExerciseUpdateInstruction extends ExerciseFields {
  exerciseId: string;
}

/** A fully-resolved, serializable set of DB writes — either run now or stashed in a PendingSync for later. */
export interface ApplyPlan {
  planId: string;
  newDays: NewDayInstruction[];
  dayUpdates: DayUpdateInstruction[];
  archivedDayIds: string[];
  newExercises: NewExerciseInstruction[];
  exerciseUpdates: ExerciseUpdateInstruction[];
  archivedExerciseIds: string[];
}

function exerciseFields(order: number, m: ExerciseMatch): ExerciseFields {
  const p = m.parsedExercise!;
  return {
    order,
    name: p.name,
    targetSets: p.targetSets,
    targetReps: p.targetReps,
    targetWeight: p.targetWeight,
    targetTime: p.targetTime,
    targetRest: p.targetRest,
    notes: p.notes,
  };
}

/**
 * Every possibly_renamed match must have a 'same' | 'different' resolution
 * before this is called — the UI enforces that (fuzzy matches are never
 * auto-resolved).
 */
export function buildApplyPlan(planId: string, diff: DiffResult, resolutions: RenameResolutions): ApplyPlan {
  const newDays: NewDayInstruction[] = [];
  const dayUpdates: DayUpdateInstruction[] = [];
  const archivedDayIds: string[] = [];
  const newExercises: NewExerciseInstruction[] = [];
  const exerciseUpdates: ExerciseUpdateInstruction[] = [];
  const archivedExerciseIds: string[] = [];

  const tempIdByParsedDay = new Map<object, string>();

  diff.dayMatches.forEach((dm, idx) => {
    if (dm.kind === 'matched') {
      dayUpdates.push({ dayId: dm.existingDay!.id, week: dm.parsedDay!.week, order: idx });
    } else if (dm.kind === 'new') {
      const tempId = crypto.randomUUID();
      tempIdByParsedDay.set(dm.parsedDay!, tempId);
      newDays.push({ tempId, week: dm.parsedDay!.week, order: idx, label: dm.parsedDay!.label });
    } else {
      archivedDayIds.push(dm.existingDay!.id);
    }
  });

  const resolveDay = (m: ExerciseMatch): { dayId?: string; tempDayId?: string } => {
    if (m.existingDayId) return { dayId: m.existingDayId };
    if (m.parsedDay && tempIdByParsedDay.has(m.parsedDay)) return { tempDayId: tempIdByParsedDay.get(m.parsedDay) };
    throw new Error(`Unresolvable destination day for exercise "${m.parsedExercise?.name ?? m.existingExercise?.name}"`);
  };

  diff.exerciseMatches.forEach((m, order) => {
    switch (m.kind) {
      case 'unchanged':
        return;
      case 'modified':
        exerciseUpdates.push({ exerciseId: m.existingExercise!.id, ...exerciseFields(order, m) });
        return;
      case 'new': {
        const { dayId, tempDayId } = resolveDay(m);
        newExercises.push({ dayId, tempDayId, ...exerciseFields(order, m) });
        return;
      }
      case 'removed':
        archivedExerciseIds.push(m.existingExercise!.id);
        return;
      case 'possibly_renamed': {
        const resolution = resolutions[m.existingExercise!.id];
        if (resolution === 'same') {
          exerciseUpdates.push({ exerciseId: m.existingExercise!.id, ...exerciseFields(order, m) });
        } else if (resolution === 'different') {
          archivedExerciseIds.push(m.existingExercise!.id);
          const { dayId, tempDayId } = resolveDay(m);
          newExercises.push({ dayId, tempDayId, ...exerciseFields(order, m) });
        } else {
          throw new Error(`Unresolved rename for "${m.existingExercise!.name}" — every possibly-renamed match needs a same/different resolution before applying.`);
        }
        return;
      }
    }
  });

  return { planId, newDays, dayUpdates, archivedDayIds, newExercises, exerciseUpdates, archivedExerciseIds };
}
