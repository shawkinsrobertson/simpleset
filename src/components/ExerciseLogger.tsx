import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Exercise } from '../db/types';
import { deleteLoggedSet, getLoggedSetsForExercise, logSet } from '../db/repo';
import { guessRepsFromTarget, guessWeightFromTarget } from '../lib/targets';
import Stepper from './Stepper';

export default function ExerciseLogger({ sessionId, exercise }: { sessionId: string; exercise: Exercise }) {
  const loggedSets = useLiveQuery(
    () => getLoggedSetsForExercise(sessionId, exercise.id),
    [sessionId, exercise.id],
  );

  const [reps, setReps] = useState<number | null>(() => guessRepsFromTarget(exercise.targetReps));
  const [weight, setWeight] = useState<number | null>(() => guessWeightFromTarget(exercise.targetWeight));
  const [showRpe, setShowRpe] = useState(false);
  const [rpe, setRpe] = useState<number | null>(null);

  const doneCount = loggedSets?.length ?? 0;
  const targetSets = exercise.targetSets;
  const isDone = targetSets != null && doneCount >= targetSets;

  const handleLog = async () => {
    await logSet({
      sessionId,
      exerciseId: exercise.id,
      setNumber: doneCount + 1,
      reps,
      weight,
      rpe,
    });
  };

  return (
    <div className={`rounded-2xl border p-4 ${isDone ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900">{exercise.name}</h3>
          <p className="text-xs text-slate-500">
            Target: {exercise.targetSets ?? '—'} × {exercise.targetReps ?? '—'}
            {exercise.targetWeight ? ` @ ${exercise.targetWeight}` : ''}
          </p>
          {exercise.notes && <p className="mt-0.5 text-xs text-slate-400">{exercise.notes}</p>}
        </div>
        <span className="whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
          {doneCount}{targetSets != null ? `/${targetSets}` : ''} sets
        </span>
      </div>

      {doneCount > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {loggedSets!.map((s, i) => (
            <button
              key={s.id}
              onClick={() => deleteLoggedSet(s.id)}
              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
              title="Tap to remove"
            >
              #{i + 1} {s.reps ?? '—'}×{s.weight ?? '—'}
              {s.rpe ? ` @${s.rpe}` : ''} ✕
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-end justify-center gap-4">
        <Stepper label="Reps" value={reps} onChange={setReps} step={1} />
        <Stepper label="Weight" value={weight} onChange={setWeight} step={5} />
        {showRpe ? (
          <Stepper label="RPE" value={rpe} onChange={setRpe} step={0.5} min={1} />
        ) : (
          <button
            onClick={() => setShowRpe(true)}
            className="self-center rounded-lg border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-400"
          >
            + RPE
          </button>
        )}
      </div>

      <button
        onClick={handleLog}
        className="mt-4 w-full rounded-xl bg-brand-600 py-3 text-center font-semibold text-white active:bg-brand-700"
      >
        Log set
      </button>
    </div>
  );
}
