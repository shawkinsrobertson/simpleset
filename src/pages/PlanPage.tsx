import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getExercisesForPlan, getPlanDays, getOpenSession, startSession } from '../db/repo';
import { useActivePlan } from '../hooks/useActivePlan';
import { useLiveValue } from '../hooks/useLiveValue';

export default function PlanPage() {
  const { loading: planLoading, plan } = useActivePlan();
  const { value: days } = useLiveValue(() => (plan ? getPlanDays(plan.id) : Promise.resolve([])), [plan?.id]);
  const { value: exercises } = useLiveValue(
    () => (plan ? getExercisesForPlan(plan.id) : Promise.resolve([])),
    [plan?.id],
  );
  const { value: openSession } = useLiveValue(
    () => (plan ? getOpenSession(plan.id) : Promise.resolve(undefined)),
    [plan?.id],
  );
  const [expanded, setExpanded] = useState<string | null>(null);

  if (planLoading) return null;

  if (!plan) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 pt-20 text-center">
        <span className="text-4xl">📋</span>
        <h1 className="text-xl font-semibold text-slate-900">No plan yet</h1>
        <Link to="/import" className="mt-2 rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white">
          Import a plan
        </Link>
      </div>
    );
  }

  const exercisesByDay = new Map<string, typeof exercises>();
  exercises?.forEach((e) => {
    exercisesByDay.set(e.dayId, [...(exercisesByDay.get(e.dayId) ?? []), e]);
  });

  return (
    <div className="flex flex-col gap-4 px-5 pt-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{plan.name}</h1>
        <p className="text-sm text-slate-500">{days?.length ?? 0} days in this program</p>
      </div>

      <div className="flex flex-col gap-2.5">
        {days?.map((day) => {
          const dayExercises = (exercisesByDay.get(day.id) ?? []).sort((a, b) => a.order - b.order);
          const isOpen = expanded === day.id;
          return (
            <div key={day.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <button
                className="flex w-full items-center justify-between text-left"
                onClick={() => setExpanded(isOpen ? null : day.id)}
              >
                <div>
                  <p className="font-semibold text-slate-900">{day.label}</p>
                  <p className="text-xs text-slate-400">
                    Week {day.week} · {dayExercises.length} exercise{dayExercises.length === 1 ? '' : 's'}
                  </p>
                </div>
                <span className="text-slate-400">{isOpen ? '▲' : '▼'}</span>
              </button>

              {isOpen && (
                <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3">
                  {dayExercises.map((ex) => (
                    <div key={ex.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{ex.name}</span>
                      <span className="text-slate-400">
                        {ex.targetSets ?? '—'}×{ex.targetReps ?? '—'}
                        {ex.targetWeight ? ` @ ${ex.targetWeight}` : ''}
                      </span>
                    </div>
                  ))}
                  {!openSession && (
                    <button
                      onClick={() => startSession(plan.id, day.id)}
                      className="mt-2 rounded-lg border border-slate-200 py-2 text-sm font-medium text-brand-600"
                    >
                      Start this day
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
