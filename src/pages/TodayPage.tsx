import { Link, useNavigate } from 'react-router-dom';
import {
  completeSession,
  getExerciseGroupsForDay,
  getExercisesForDay,
  getLoggedSetsForSession,
  getNextDay,
  getOpenSession,
  getPlanDays,
  skipSession,
  startSession,
} from '../db/repo';
import { getCycleProgress, getStreak } from '../lib/stats';
import { db } from '../db/db';
import { useActivePlan } from '../hooks/useActivePlan';
import { useLiveValue } from '../hooks/useLiveValue';
import { groupIntoRuns } from '../lib/groupRuns';
import Card from '../components/Card';
import StatusBox, { type BoxState } from '../components/StatusBox';
import type { Exercise } from '../db/types';

function exerciseState(ex: Exercise, doneCount: number, isActive: boolean): BoxState {
  const isDone = ex.targetSets != null && doneCount >= ex.targetSets;
  if (isDone) return 'done';
  if (isActive) return 'active';
  return 'todo';
}

export default function TodayPage() {
  const navigate = useNavigate();
  const { loading: planLoading, plan } = useActivePlan();

  const { value: planDays } = useLiveValue(
    () => (plan ? getPlanDays(plan.id) : Promise.resolve([])),
    [plan?.id],
  );
  const { loading: sessionLoading, value: openSession } = useLiveValue(
    () => (plan ? getOpenSession(plan.id) : Promise.resolve(undefined)),
    [plan?.id],
  );
  const { value: nextDay } = useLiveValue(
    () => (plan ? getNextDay(plan.id) : Promise.resolve(undefined)),
    [plan?.id, openSession],
  );
  const { value: sessionDay } = useLiveValue(
    () => (openSession ? db.planDays.get(openSession.dayId) : Promise.resolve(undefined)),
    [openSession?.dayId],
  );
  // includeArchived: a re-sync mid-workout must not yank an exercise out
  // from under an already-open session — structural changes apply going
  // forward (the next time a day is started), not retroactively.
  const { value: exercises } = useLiveValue(
    () => (openSession ? getExercisesForDay(openSession.dayId, { includeArchived: true }) : Promise.resolve([])),
    [openSession?.dayId],
  );
  const { value: groups } = useLiveValue(
    () => (openSession ? getExerciseGroupsForDay(openSession.dayId) : Promise.resolve([])),
    [openSession?.dayId],
  );
  const { value: loggedSets } = useLiveValue(
    () => (openSession ? getLoggedSetsForSession(openSession.id) : Promise.resolve([])),
    [openSession?.id],
  );
  const { value: streak } = useLiveValue(() => (plan ? getStreak(plan.id) : Promise.resolve(0)), [plan?.id, openSession]);
  const { value: cycle } = useLiveValue(
    () => (plan ? getCycleProgress(plan.id) : Promise.resolve({ completed: 0, total: 0 })),
    [plan?.id, openSession],
  );

  const doneCounts = new Map<string, number>();
  loggedSets?.forEach((s) => doneCounts.set(s.exerciseId, (doneCounts.get(s.exerciseId) ?? 0) + 1));
  const sessionVolume = (loggedSets ?? []).reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0);

  const orderedExercises = (exercises ?? []).slice().sort((a, b) => a.order - b.order);
  const firstIncompleteId = orderedExercises.find((ex) => {
    const done = doneCounts.get(ex.id) ?? 0;
    return !(ex.targetSets != null && done >= ex.targetSets);
  })?.id;

  const runs = groupIntoRuns(orderedExercises, groups ?? []);

  if (planLoading) return null;

  if (!plan) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 pt-20 text-center">
        <span className="text-4xl">🗒️</span>
        <h1 className="font-display text-xl font-semibold text-text">No plan yet</h1>
        <p className="text-sm text-text-secondary">Import a workout plan to start tracking your training.</p>
        <Link to="/import" className="btn-primary mt-2 px-5 py-3">
          Import a plan
        </Link>
      </div>
    );
  }

  if (planDays && planDays.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 pt-20 text-center">
        <span className="text-4xl">🤔</span>
        <h1 className="font-display text-xl font-semibold text-text">This plan has no days yet</h1>
        <p className="text-sm text-text-secondary">Head to Plans to re-import or edit "{plan.name}".</p>
      </div>
    );
  }

  if (sessionLoading) return null;

  const Wordmark = (
    <h1 className="font-display text-2xl font-semibold">
      <span className="text-text">simple</span>
      <span className="text-accent">set</span>
    </h1>
  );

  if (!openSession) {
    return (
      <div className="flex flex-col gap-5 px-5 pt-10">
        {Wordmark}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">{plan.name}</p>
          <h2 className="font-display text-xl font-semibold text-text">Ready for your next session?</h2>
        </div>
        {nextDay ? (
          <Card className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Up next</p>
            <p className="mt-1 text-lg font-semibold text-text">{nextDay.label}</p>
            {nextDay.week > 1 && <p className="text-sm text-text-secondary">Week {nextDay.week}</p>}
            <button
              onClick={() => startSession(plan.id, nextDay.id)}
              className="btn-primary mt-4 w-full py-3.5"
            >
              Start workout
            </button>
          </Card>
        ) : (
          <p className="text-sm text-text-secondary">Loading…</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-5 pt-8">
      {Wordmark}
      <p className="-mt-2 text-xs font-medium uppercase tracking-wide text-text-secondary">{plan.name}</p>

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3 text-center">
          <p className="font-mono text-xl font-semibold text-text">🔥{streak ?? 0}</p>
          <p className="text-[10px] uppercase tracking-wide text-text-secondary">Streak</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="font-mono text-xl font-semibold text-text">
            {cycle?.completed ?? 0}/{cycle?.total ?? 0}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-text-secondary">Sessions completed</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="font-mono text-xl font-semibold text-text">{Math.round(sessionVolume).toLocaleString()}</p>
          <p className="text-[10px] uppercase tracking-wide text-text-secondary">Volume</p>
        </Card>
      </div>

      <div>
        <p className="mb-1 text-lg font-semibold text-text">{sessionDay?.label ?? 'Workout'}</p>
        <div className="flex flex-wrap gap-1.5">
          {orderedExercises.map((ex) => (
            <StatusBox
              key={ex.id}
              state={exerciseState(ex, doneCounts.get(ex.id) ?? 0, ex.id === firstIncompleteId)}
              size={24}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {runs.map((run, runIdx) => (
          <div key={run.group?.id ?? `solo-${runIdx}`} className={run.group ? 'flex flex-col gap-2 rounded border-l-4 border-accent bg-accent/10 p-2' : 'contents'}>
            {run.group && (
              <p className="ml-1 text-xs font-semibold uppercase tracking-wide text-accent">
                {run.group.label ?? (run.group.type === 'circuit' ? 'Circuit' : 'Superset')}
              </p>
            )}
            {run.exercises.map((ex) => {
              const done = doneCounts.get(ex.id) ?? 0;
              const state = exerciseState(ex, done, ex.id === firstIncompleteId);
              return (
                <Card key={ex.id} state={state} as="button" className="p-4" onClick={() => navigate(`/log/${ex.id}`)}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className={`font-semibold text-text ${state === 'done' ? 'line-through' : ''}`}>{ex.name}</h3>
                      <p className="font-mono text-xs text-text-secondary">
                        Target: {ex.targetSets ?? '—'} × {ex.targetReps ?? ex.targetTime ?? '—'}
                        {ex.targetWeight ? ` @ ${ex.targetWeight}` : ''}
                        {ex.targetRest ? ` · rest ${ex.targetRest}` : ''}
                      </p>
                    </div>
                    <span className="whitespace-nowrap rounded-full bg-bg px-2.5 py-1 font-mono text-xs font-semibold text-text">
                      {state === 'active' ? `in progress ${done}/${ex.targetSets ?? '—'}` : `${done}${ex.targetSets != null ? `/${ex.targetSets}` : ''}`}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        ))}
      </div>

      <div className="sticky bottom-20 flex gap-2 rounded border border-border bg-card/95 p-3 backdrop-blur">
        <button
          onClick={() => skipSession(openSession.id)}
          className="btn-secondary flex-1 py-3"
        >
          Skip
        </button>
        <button
          onClick={() => completeSession(openSession.id)}
          className="btn-primary flex-[2] py-3"
        >
          Finish workout
        </button>
      </div>
    </div>
  );
}
