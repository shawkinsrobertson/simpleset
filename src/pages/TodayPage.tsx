import { Link } from 'react-router-dom';
import {
  completeSession,
  getExercisesForDay,
  getNextDay,
  getOpenSession,
  getPlanDays,
  skipSession,
  startSession,
} from '../db/repo';
import ExerciseLogger from '../components/ExerciseLogger';
import { db } from '../db/db';
import { useActivePlan } from '../hooks/useActivePlan';
import { useLiveValue } from '../hooks/useLiveValue';

export default function TodayPage() {
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
  const { value: exercises } = useLiveValue(
    () => (openSession ? getExercisesForDay(openSession.dayId) : Promise.resolve([])),
    [openSession?.dayId],
  );

  if (planLoading) return null;

  if (!plan) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 pt-20 text-center">
        <span className="text-4xl">🗒️</span>
        <h1 className="text-xl font-semibold text-slate-900">No plan yet</h1>
        <p className="text-sm text-slate-500">Import a workout plan to start tracking your training.</p>
        <Link to="/import" className="mt-2 rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white">
          Import a plan
        </Link>
      </div>
    );
  }

  if (planDays && planDays.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 pt-20 text-center">
        <span className="text-4xl">🤔</span>
        <h1 className="text-xl font-semibold text-slate-900">This plan has no days yet</h1>
        <p className="text-sm text-slate-500">Head to Plans to re-import or edit "{plan.name}".</p>
      </div>
    );
  }

  if (sessionLoading) return null;

  if (!openSession) {
    return (
      <div className="flex flex-col gap-5 px-5 pt-10">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-brand-600">{plan.name}</p>
          <h1 className="text-2xl font-semibold text-slate-900">Ready for your next session?</h1>
        </div>
        {nextDay ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Up next</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{nextDay.label}</p>
            {nextDay.week > 1 && <p className="text-sm text-slate-500">Week {nextDay.week}</p>}
            <button
              onClick={() => startSession(plan.id, nextDay.id)}
              className="mt-4 w-full rounded-xl bg-brand-600 py-3.5 font-semibold text-white"
            >
              Start workout
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Loading…</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-5 pt-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-brand-600">{plan.name}</p>
        <h1 className="text-2xl font-semibold text-slate-900">{sessionDay?.label ?? 'Workout'}</h1>
      </div>

      <div className="flex flex-col gap-3">
        {exercises?.map((ex) => (
          <ExerciseLogger key={ex.id} sessionId={openSession.id} exercise={ex} />
        ))}
      </div>

      <div className="sticky bottom-20 flex gap-2 rounded-2xl bg-white/95 p-3 shadow-lg backdrop-blur">
        <button
          onClick={() => skipSession(openSession.id)}
          className="flex-1 rounded-xl border border-slate-200 py-3 font-medium text-slate-600"
        >
          Skip
        </button>
        <button
          onClick={() => completeSession(openSession.id)}
          className="flex-[2] rounded-xl bg-brand-600 py-3 font-semibold text-white"
        >
          Finish workout
        </button>
      </div>
    </div>
  );
}
