import { useNavigate, useParams } from 'react-router-dom';
import type { ParsedDay, ParsedExercise, ParsedGroup } from '../parser/types';
import type { Exercise, ExerciseGroup, PlanDay } from '../db/types';
import {
  archiveDayInDb,
  archiveExerciseInDb,
  duplicateDayInDb,
  duplicateExerciseInDb,
  getDay,
  getExerciseGroupsForDay,
  getExercisesForDay,
  groupExercisesInDb,
  insertExerciseInDayInDb,
  repeatDayInDb,
  reorderExercisesInDb,
  ungroupExercisesInDb,
  updateDayInDb,
  updateExerciseInDb,
} from '../db/repo';
import { useLiveValue } from '../hooks/useLiveValue';
import DayBlock from '../components/planGrid/DayBlock';

/** Live DB rows share every editable field name with ParsedExercise/ParsedGroup, so this is a pure reshape — no translation. */
function toParsedDay(day: PlanDay, exercises: Exercise[], groups: ExerciseGroup[]): ParsedDay {
  const parsedGroups: ParsedGroup[] = groups
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((g) => ({ tempId: g.id, type: g.type, label: g.label }));

  const parsedExercises: ParsedExercise[] = exercises
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((e) => ({
      tempId: e.id,
      name: e.name,
      targetSets: e.targetSets,
      targetReps: e.targetReps,
      targetWeight: e.targetWeight,
      targetTime: e.targetTime,
      targetRest: e.targetRest,
      notes: e.notes,
      groupTempId: e.groupId,
      raw: '',
    }));

  return { tempId: day.id, week: day.week, label: day.label, exercises: parsedExercises, groups: parsedGroups };
}

export default function EditDayPage() {
  const { dayId } = useParams<{ dayId: string }>();
  const navigate = useNavigate();

  const { loading: dayLoading, value: day } = useLiveValue(
    () => (dayId ? getDay(dayId) : Promise.resolve(undefined)),
    [dayId],
  );
  const { value: exercises } = useLiveValue(
    () => (dayId ? getExercisesForDay(dayId) : Promise.resolve([])),
    [dayId],
  );
  const { value: groups } = useLiveValue(
    () => (dayId ? getExerciseGroupsForDay(dayId) : Promise.resolve([])),
    [dayId],
  );

  if (dayLoading) return null;

  if (!day) {
    return (
      <div className="px-5 pt-10 text-center text-text-secondary">
        <p>This day couldn't be found.</p>
        <button className="btn-primary mt-4 px-4 py-2" onClick={() => navigate('/plan')}>
          Back to Plan
        </button>
      </div>
    );
  }

  const planId = day.planId;
  const parsedDay = toParsedDay(day, exercises ?? [], groups ?? []);

  return (
    <div className="flex flex-col gap-4 px-5 pt-8 pb-10">
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/plan')}
          aria-label="Back to Plan"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-text-secondary"
        >
          ←
        </button>
        <h1 className="font-display text-xl font-semibold text-text">Edit day</h1>
      </div>

      <DayBlock
        day={parsedDay}
        onUpdateDay={(patch) => updateDayInDb(day.id, patch)}
        onDeleteDay={async () => {
          await archiveDayInDb(planId, day.id);
          navigate('/plan');
        }}
        onDuplicateDay={() => duplicateDayInDb(planId, day.id)}
        onRepeatDay={(weekCount) => repeatDayInDb(planId, day.id, weekCount)}
        onAddExercise={() => insertExerciseInDayInDb(planId, day.id, parsedDay.exercises.at(-1)?.tempId ?? null)}
        onInsertExercise={(afterExTempId) => insertExerciseInDayInDb(planId, day.id, afterExTempId)}
        onDuplicateExercise={(exTempId) => duplicateExerciseInDb(exTempId)}
        onUpdateExercise={(exTempId, patch) => updateExerciseInDb(exTempId, patch)}
        onDeleteExercise={(exTempId) => archiveExerciseInDb(exTempId)}
        onReorderExercises={(newOrder) => reorderExercisesInDb(newOrder)}
        onGroupExercises={(exTempIds, type) => groupExercisesInDb(planId, day.id, exTempIds, type)}
        onUngroup={(groupTempId) => ungroupExercisesInDb(groupTempId)}
      />
    </div>
  );
}
