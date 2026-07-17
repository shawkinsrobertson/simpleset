import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../db/db';
import { deleteLoggedSet, getLoggedSetsForExercise, getOpenSession, logSet } from '../db/repo';
import { useActivePlan } from '../hooks/useActivePlan';
import { useLiveValue } from '../hooks/useLiveValue';
import { formatSeconds, guessRepsFromTarget, guessSecondsFromTarget, guessWeightFromTarget } from '../lib/targets';
import StatusBox from '../components/StatusBox';
import Card from '../components/Card';
import Stepper from '../components/Stepper';

export default function LoggingPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const navigate = useNavigate();
  const { loading: planLoading, plan } = useActivePlan();

  const { value: openSession } = useLiveValue(
    () => (plan ? getOpenSession(plan.id) : Promise.resolve(undefined)),
    [plan?.id],
  );
  const { value: exercise } = useLiveValue(
    () => (exerciseId ? db.exercises.get(exerciseId) : Promise.resolve(undefined)),
    [exerciseId],
  );
  const { value: loggedSets } = useLiveValue(
    () => (openSession && exerciseId ? getLoggedSetsForExercise(openSession.id, exerciseId) : Promise.resolve([])),
    [openSession?.id, exerciseId],
  );

  const isTimed = exercise?.targetTime != null;
  const [reps, setReps] = useState<number | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [weight, setWeight] = useState<number | null>(null);
  const [showRpe, setShowRpe] = useState(false);
  const [rpe, setRpe] = useState<number | null>(null);
  const [primed, setPrimed] = useState(false);

  useEffect(() => {
    if (!exercise || primed) return;
    setReps(guessRepsFromTarget(exercise.targetReps));
    setSeconds(guessSecondsFromTarget(exercise.targetTime));
    setWeight(guessWeightFromTarget(exercise.targetWeight));
    setPrimed(true);
  }, [exercise, primed]);

  if (planLoading) return null;
  if (!plan || !openSession || !exercise) {
    return (
      <div className="px-5 pt-10 text-center text-text-secondary">
        <p>No active workout to log against.</p>
        <button onClick={() => navigate('/today')} className="mt-4 rounded bg-accent px-4 py-2 text-accent-ink">
          Back to today
        </button>
      </div>
    );
  }

  const doneCount = loggedSets?.length ?? 0;
  const targetSets = exercise.targetSets;
  const isDone = targetSets != null && doneCount >= targetSets;

  const handleLog = async () => {
    await logSet({
      sessionId: openSession.id,
      exerciseId: exercise.id,
      setNumber: doneCount + 1,
      reps: isTimed ? null : reps,
      weight,
      timeSeconds: isTimed ? seconds : null,
      rpe,
      targetSetsAtLog: exercise.targetSets,
      targetRepsAtLog: exercise.targetReps,
      targetWeightAtLog: exercise.targetWeight,
      targetTimeAtLog: exercise.targetTime,
      targetRestAtLog: exercise.targetRest,
    });
    setRpe(null);
    setShowRpe(false);
  };

  const upcomingCount = targetSets != null ? Math.max(0, targetSets - doneCount - (isDone ? 0 : 1)) : 0;

  return (
    <div className="flex flex-col gap-4 px-5 pt-6">
      <button onClick={() => navigate('/today')} className="self-start text-sm font-medium text-text-secondary">
        ← Back
      </button>

      <div>
        <h1 className="text-xl font-semibold text-text">{exercise.name}</h1>
        <p className="text-xs text-text-secondary">
          Target: {exercise.targetSets ?? '—'} × {exercise.targetReps ?? exercise.targetTime ?? '—'}
          {exercise.targetWeight ? ` @ ${exercise.targetWeight}` : ''}
          {exercise.targetRest ? ` · rest ${exercise.targetRest}` : ''}
        </p>
        {exercise.notes && <p className="mt-1 text-xs text-text-secondary">{exercise.notes}</p>}
      </div>

      <div className="flex flex-col gap-2">
        {loggedSets?.map((s, i) => (
          <button
            key={s.id}
            onClick={() => deleteLoggedSet(s.id)}
            className="flex items-center gap-3 rounded border border-border bg-card p-3 text-left opacity-60"
            title="Tap to remove"
          >
            <StatusBox state="done" />
            <span className="font-mono text-sm text-text">
              #{i + 1} · {s.timeSeconds != null ? formatSeconds(s.timeSeconds) : (s.reps ?? '—')}
              {s.weight ? ` × ${s.weight}` : ''}
              {s.rpe ? ` @${s.rpe}` : ''}
            </span>
          </button>
        ))}

        {!isDone && (
          <Card state="active" className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <StatusBox state="active" />
                <span className="font-mono text-sm font-semibold text-text">Set {doneCount + 1}</span>
              </div>
              {!showRpe && (
                <button
                  onClick={() => setShowRpe(true)}
                  className="rounded border border-dashed border-border px-2 py-1 text-xs text-text-secondary"
                >
                  + RPE
                </button>
              )}
            </div>
            <div className="mt-3 flex items-end justify-center gap-3">
              {isTimed ? (
                <Stepper label="Seconds" value={seconds} onChange={setSeconds} step={5} />
              ) : (
                <Stepper label="Reps" value={reps} onChange={setReps} step={1} />
              )}
              <Stepper label="Weight" value={weight} onChange={setWeight} step={5} />
            </div>
            {showRpe && (
              <div className="mt-3 flex justify-center">
                <Stepper label="RPE" value={rpe} onChange={setRpe} step={0.5} min={1} />
              </div>
            )}
            <button
              onClick={handleLog}
              className="mt-4 w-full rounded bg-accent py-3 text-center font-semibold text-accent-ink active:opacity-90"
            >
              Log set {doneCount + 1}
            </button>
          </Card>
        )}

        {Array.from({ length: upcomingCount }).map((_, i) => (
          <div
            key={`upcoming-${i}`}
            className="flex items-center gap-3 rounded border border-border p-3 opacity-50"
          >
            <StatusBox state="todo" />
            <span className="font-mono text-sm text-text-secondary">Set {doneCount + 2 + i} · up next</span>
          </div>
        ))}

        {isDone && (
          <div className="flex flex-col items-center gap-3 rounded border border-border bg-card p-6 text-center">
            <p className="text-sm font-semibold text-text">All sets done ✓</p>
            <button onClick={() => navigate('/today')} className="rounded bg-accent px-4 py-2 text-sm font-semibold text-accent-ink">
              Back to day
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
