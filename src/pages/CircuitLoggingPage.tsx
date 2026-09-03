import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../db/db';
import { getExercisesForDay, getLoggedSetsForExercise, getOpenSession, logSet } from '../db/repo';
import { useActivePlan } from '../hooks/useActivePlan';
import { useLiveValue } from '../hooks/useLiveValue';
import { guessRepsFromTarget, guessSecondsFromTarget, guessWeightFromTarget } from '../lib/targets';
import Card from '../components/Card';
import Stepper from '../components/Stepper';
import RestTimer from '../components/RestTimer';

const DEFAULT_REST_SECONDS = 60;

/**
 * A circuit's position (which station, which round) is derived from how
 * many sets have been logged across the group so far, rather than tracked
 * as separate component state — stations are always logged in order, so
 * this stays correct even after a reload or navigating away mid-circuit.
 */
export default function CircuitLoggingPage() {
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
  const { value: doneCounts } = useLiveValue(
    async () => {
      if (!openSession || !exercises || exercises.length === 0) return {};
      const entries = await Promise.all(
        exercises.map(async (ex) => [ex.id, (await getLoggedSetsForExercise(openSession.id, ex.id)).length] as const),
      );
      return Object.fromEntries(entries);
    },
    [openSession?.id, exercises],
  );

  const [resting, setResting] = useState(false);
  const [reps, setReps] = useState<number | null>(null);
  const [weight, setWeight] = useState<number | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [primedForId, setPrimedForId] = useState<string | null>(null);

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

  const totalRounds = Math.max(...exercises.map((ex) => ex.targetSets ?? 0)) || 1;
  const totalLogged = exercises.reduce((sum, ex) => sum + (doneCounts[ex.id] ?? 0), 0);
  const totalStations = exercises.length * totalRounds;
  const isDone = totalLogged >= totalStations;
  const stationIndex = totalLogged % exercises.length;
  const round = Math.floor(totalLogged / exercises.length) + 1;
  const currentExercise = exercises[stationIndex];
  const justCompleted = exercises[(stationIndex - 1 + exercises.length) % exercises.length];
  const restSeconds = guessSecondsFromTarget(justCompleted.targetRest) ?? DEFAULT_REST_SECONDS;

  if (currentExercise.id !== primedForId) {
    setPrimedForId(currentExercise.id);
    setReps(guessRepsFromTarget(currentExercise.targetReps));
    setWeight(guessWeightFromTarget(currentExercise.targetWeight));
    setSeconds(guessSecondsFromTarget(currentExercise.targetTime));
  }

  const isTimed = currentExercise.targetTime != null;

  const logStation = async () => {
    await logSet({
      sessionId: openSession.id,
      exerciseId: currentExercise.id,
      setNumber: (doneCounts[currentExercise.id] ?? 0) + 1,
      reps: isTimed ? null : reps,
      weight,
      timeSeconds: isTimed ? seconds : null,
      rpe: null,
      targetSetsAtLog: currentExercise.targetSets,
      targetRepsAtLog: currentExercise.targetReps,
      targetWeightAtLog: currentExercise.targetWeight,
      targetTimeAtLog: currentExercise.targetTime,
      targetRestAtLog: currentExercise.targetRest,
    });
    const willBeDone = totalLogged + 1 >= totalStations;
    if (!willBeDone) setResting(true);
  };

  return (
    <div className="flex flex-col gap-4 px-5 pt-6">
      <button onClick={() => navigate('/today')} className="self-start text-sm font-medium text-text-secondary">
        ← Back
      </button>

      <div>
        <h1 className="text-xl font-semibold text-text">{group.label ?? 'Circuit'}</h1>
        <p className="text-xs text-text-secondary">{exercises.map((ex) => ex.name).join(' → ')}</p>
      </div>

      {!isDone && (
        <p className="font-mono text-xs font-extralight text-text-secondary">
          Round {round} of {totalRounds} · Station {stationIndex + 1} of {exercises.length}
        </p>
      )}

      {resting && <RestTimer seconds={restSeconds} onDone={() => setResting(false)} />}

      {!isDone && !resting && (
        <Card state="active" className="p-4">
          <p className="font-semibold text-text">{currentExercise.name}</p>
          <p className="font-mono text-xs font-extralight text-text-secondary">
            Target: {currentExercise.targetReps ?? currentExercise.targetTime ?? '—'}
            {currentExercise.targetWeight ? ` @ ${currentExercise.targetWeight}` : ''}
          </p>

          {isTimed ? (
            <RestTimer seconds={seconds ?? 0} onDone={logStation} label="Work" />
          ) : (
            <>
              <div className="mt-3 flex items-end justify-center gap-3">
                <Stepper label="Reps" value={reps} onChange={setReps} step={1} />
                <Stepper label="Weight" value={weight} onChange={setWeight} step={5} />
              </div>
              <button onClick={logStation} className="btn-primary mt-4 w-full py-3">
                Log &amp; continue
              </button>
            </>
          )}
        </Card>
      )}

      {isDone && (
        <div className="flex flex-col items-center gap-3 rounded border border-border bg-card p-6 text-center">
          <p className="text-sm font-semibold text-text">Circuit complete ✓</p>
          <button onClick={() => navigate('/today')} className="btn-primary px-4 py-2 text-sm">
            Back to day
          </button>
        </div>
      )}

    </div>
  );
}
