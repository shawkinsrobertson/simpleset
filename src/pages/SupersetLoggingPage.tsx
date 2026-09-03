import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../db/db';
import { getExercisesForDay, getLoggedSetsForExercise, getOpenSession, logSet } from '../db/repo';
import { useActivePlan } from '../hooks/useActivePlan';
import { useLiveValue } from '../hooks/useLiveValue';
import { formatSeconds, guessRepsFromTarget, guessSecondsFromTarget, guessWeightFromTarget } from '../lib/targets';
import Card from '../components/Card';
import Stepper from '../components/Stepper';
import RestTimer from '../components/RestTimer';

const DEFAULT_REST_SECONDS = 60;

interface Inputs {
  reps: number | null;
  weight: number | null;
  seconds: number | null;
}

/**
 * Superset exercises are logged together, one round at a time — every
 * exercise in the group gets its own input row on this one card, and a
 * single "Log round" action logs a set for each of them at once, instead of
 * backing out to Today and re-entering per exercise.
 */
export default function SupersetLoggingPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { loading: planLoading, plan } = useActivePlan();

  const { value: openSession } = useLiveValue(
    () => (plan ? getOpenSession(plan.id) : Promise.resolve(undefined)),
    [plan?.id],
  );
  const { value: group } = useLiveValue(
    () => (groupId ? db.exerciseGroups.get(groupId) : Promise.resolve(undefined)),
    [groupId],
  );
  const { value: exercises } = useLiveValue(
    async () => {
      if (!group) return [];
      const dayExercises = await getExercisesForDay(group.dayId);
      return dayExercises.filter((e) => e.groupId === group.id).sort((a, b) => a.order - b.order);
    },
    [group?.id, group?.dayId],
  );
  const { value: loggedByExercise } = useLiveValue(
    async () => {
      if (!openSession || !exercises || exercises.length === 0) return {};
      const entries = await Promise.all(
        exercises.map(async (ex) => [ex.id, await getLoggedSetsForExercise(openSession.id, ex.id)] as const),
      );
      return Object.fromEntries(entries);
    },
    [openSession?.id, exercises],
  );
  const doneCounts = loggedByExercise
    ? Object.fromEntries(Object.entries(loggedByExercise).map(([id, sets]) => [id, sets.length]))
    : undefined;

  const [inputs, setInputs] = useState<Record<string, Inputs>>({});
  const [primedIds, setPrimedIds] = useState<Set<string>>(new Set());
  const [resting, setResting] = useState(false);

  useEffect(() => {
    if (!exercises) return;
    const unprimed = exercises.filter((ex) => !primedIds.has(ex.id));
    if (unprimed.length === 0) return;
    setInputs((prev) => {
      const next = { ...prev };
      for (const ex of unprimed) {
        next[ex.id] = {
          reps: guessRepsFromTarget(ex.targetReps),
          weight: guessWeightFromTarget(ex.targetWeight),
          seconds: guessSecondsFromTarget(ex.targetTime),
        };
      }
      return next;
    });
    setPrimedIds((prev) => new Set([...prev, ...unprimed.map((ex) => ex.id)]));
  }, [exercises, primedIds]);

  if (planLoading) return null;
  if (!plan || !openSession || !group || !exercises || exercises.length === 0 || !doneCounts) {
    return (
      <div className="px-5 pt-10 text-center text-text-secondary">
        <p>No active workout to log against.</p>
        <button onClick={() => navigate('/today')} className="btn-primary mt-4 px-4 py-2">
          Back to today
        </button>
      </div>
    );
  }

  const totalRounds = Math.max(...exercises.map((ex) => ex.targetSets ?? 0)) || null;
  const round = Math.min(...exercises.map((ex) => doneCounts[ex.id] ?? 0));
  const isDone = totalRounds != null && round >= totalRounds;
  const restSeconds = Math.max(...exercises.map((ex) => guessSecondsFromTarget(ex.targetRest) ?? 0)) || DEFAULT_REST_SECONDS;

  const setInput = (exerciseId: string, patch: Partial<Inputs>) => {
    setInputs((prev) => ({ ...prev, [exerciseId]: { ...prev[exerciseId], ...patch } }));
  };

  const handleLogRound = async () => {
    await Promise.all(
      exercises.map((ex) => {
        const isTimed = ex.targetTime != null;
        const values = inputs[ex.id] ?? { reps: null, weight: null, seconds: null };
        return logSet({
          sessionId: openSession.id,
          exerciseId: ex.id,
          setNumber: (doneCounts[ex.id] ?? 0) + 1,
          reps: isTimed ? null : values.reps,
          weight: values.weight,
          timeSeconds: isTimed ? values.seconds : null,
          rpe: null,
          targetSetsAtLog: ex.targetSets,
          targetRepsAtLog: ex.targetReps,
          targetWeightAtLog: ex.targetWeight,
          targetTimeAtLog: ex.targetTime,
          targetRestAtLog: ex.targetRest,
        });
      }),
    );
    const willBeDone = totalRounds != null && round + 1 >= totalRounds;
    if (!willBeDone) setResting(true);
  };

  return (
    <div className="flex flex-col gap-4 px-5 pt-6">
      <button onClick={() => navigate('/today')} className="self-start text-sm font-medium text-text-secondary">
        ← Back
      </button>

      <div>
        <h1 className="text-xl font-semibold text-text">{group.label ?? 'Superset'}</h1>
        <p className="text-xs text-text-secondary">{exercises.map((ex) => ex.name).join(' + ')}</p>
      </div>

      {resting && <RestTimer seconds={restSeconds} onDone={() => setResting(false)} />}

      {!isDone && !resting && (
        <Card state="active" className="flex flex-col gap-4 p-4">
          <p className="font-mono text-sm font-semibold text-text">Round {round + 1}{totalRounds != null ? ` of ${totalRounds}` : ''}</p>
          {exercises.map((ex) => {
            const isTimed = ex.targetTime != null;
            const values = inputs[ex.id] ?? { reps: null, weight: null, seconds: null };
            return (
              <div key={ex.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                <p className="text-sm font-semibold text-text">{ex.name}</p>
                <div className="mt-2 flex items-end justify-center gap-3">
                  {isTimed ? (
                    <Stepper label="Seconds" value={values.seconds} onChange={(v) => setInput(ex.id, { seconds: v })} step={5} />
                  ) : (
                    <Stepper label="Reps" value={values.reps} onChange={(v) => setInput(ex.id, { reps: v })} step={1} />
                  )}
                  <Stepper label="Weight" value={values.weight} onChange={(v) => setInput(ex.id, { weight: v })} step={5} />
                </div>
              </div>
            );
          })}
          <button onClick={handleLogRound} className="btn-primary w-full py-3">
            Log round {round + 1}
          </button>
        </Card>
      )}

      {isDone && (
        <div className="flex flex-col items-center gap-3 rounded border border-border bg-card p-6 text-center">
          <p className="text-sm font-semibold text-text">All rounds done ✓</p>
          <button onClick={() => navigate('/today')} className="btn-primary px-4 py-2 text-sm">
            Back to day
          </button>
        </div>
      )}

      {round > 0 && loggedByExercise && (
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: round }).map((_, i) => (
            <div key={i} className="rounded border border-border bg-card p-3 opacity-60">
              <p className="font-mono text-xs font-extralight text-text-secondary">Round {i + 1} logged</p>
              <div className="mt-1 flex flex-col gap-0.5">
                {exercises.map((ex) => {
                  const set = loggedByExercise[ex.id]?.[i];
                  if (!set) return null;
                  return (
                    <p key={ex.id} className="font-mono text-sm font-extralight text-text">
                      {ex.name}: {set.timeSeconds != null ? formatSeconds(set.timeSeconds) : (set.reps ?? '—')}
                      {set.weight ? ` × ${set.weight}` : ''}
                    </p>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
