import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  duplicateDayInDb,
  getExerciseGroupsForPlan,
  getExercisesForPlan,
  getPlanDays,
  getOpenSession,
  repeatDayInDb,
  startSession,
} from '../db/repo';
import { useActivePlan } from '../hooks/useActivePlan';
import { useLiveValue } from '../hooks/useLiveValue';
import Modal from '../components/Modal';
import type { Exercise, ExerciseGroup } from '../db/types';
import { groupIntoRuns } from '../lib/groupRuns';

export default function PlanPage() {
  const { loading: planLoading, plan } = useActivePlan();
  const { value: days } = useLiveValue(() => (plan ? getPlanDays(plan.id) : Promise.resolve([])), [plan?.id]);
  const { value: exercises } = useLiveValue(
    () => (plan ? getExercisesForPlan(plan.id) : Promise.resolve([])),
    [plan?.id],
  );
  const { value: groups } = useLiveValue(
    () => (plan ? getExerciseGroupsForPlan(plan.id) : Promise.resolve([])),
    [plan?.id],
  );
  const { value: openSession } = useLiveValue(
    () => (plan ? getOpenSession(plan.id) : Promise.resolve(undefined)),
    [plan?.id],
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [repeatDayId, setRepeatDayId] = useState<string | null>(null);
  const [repeatWeeks, setRepeatWeeks] = useState(1);

  if (planLoading) return null;

  if (!plan) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 pt-20 text-center">
        <h1 className="text-xl font-semibold text-text">No plan yet</h1>
        <Link to="/import" className="btn-primary mt-2 px-5 py-3">
          Import a plan
        </Link>
      </div>
    );
  }

  const exercisesByDay = new Map<string, Exercise[]>();
  exercises?.forEach((e) => {
    exercisesByDay.set(e.dayId, [...(exercisesByDay.get(e.dayId) ?? []), e]);
  });
  const groupsByDay = new Map<string, ExerciseGroup[]>();
  groups?.forEach((g) => {
    groupsByDay.set(g.dayId, [...(groupsByDay.get(g.dayId) ?? []), g]);
  });

  const repeatDay = days?.find((d) => d.id === repeatDayId);

  return (
    <div className="flex flex-col gap-4 px-5 pt-8">
      <div>
        <h1 className="text-2xl font-semibold text-text">{plan.name}</h1>
        <p className="text-sm text-text-secondary">{days?.length ?? 0} days in this program</p>
      </div>

      <div className="flex flex-col gap-2.5">
        {days?.map((day) => {
          const dayExercises = (exercisesByDay.get(day.id) ?? []).sort((a, b) => a.order - b.order);
          const dayGroups = groupsByDay.get(day.id) ?? [];
          const runs = groupIntoRuns(dayExercises, dayGroups);
          const isOpen = expanded === day.id;
          return (
            <div key={day.id} className="rounded border border-border bg-card p-4">
              <button
                className="flex w-full items-center justify-between text-left"
                onClick={() => setExpanded(isOpen ? null : day.id)}
              >
                <div>
                  <p className="font-semibold text-text">{day.label}</p>
                  <p className="text-xs text-text-secondary">
                    Week {day.week} · {dayExercises.length} exercise{dayExercises.length === 1 ? '' : 's'}
                  </p>
                </div>
                <span className="text-text-secondary">{isOpen ? '▲' : '▼'}</span>
              </button>

              {isOpen && (
                <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                  {runs.map((run, runIdx) => (
                    <div
                      key={run.group?.id ?? `solo-${runIdx}`}
                      className={run.group ? 'rounded border-l-4 border-accent bg-accent/10 py-1 pl-2' : ''}
                    >
                      {run.group && (
                        <p className="mb-0.5 text-[11px] font-semibold text-accent">
                          {run.group.label ?? (run.group.type === 'circuit' ? 'Circuit' : 'Superset')}
                        </p>
                      )}
                      {run.exercises.map((ex) => (
                        <div key={ex.id} className="flex items-center justify-between text-sm">
                          <span className="text-text">{ex.name}</span>
                          <span className="text-text-secondary">
                            {ex.targetSets ?? '—'}×{ex.targetReps ?? ex.targetTime ?? '—'}
                            {ex.targetWeight ? ` @ ${ex.targetWeight}` : ''}
                            {ex.targetRest ? ` · rest ${ex.targetRest}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}

                  <div className="mt-1 flex gap-2">
                    <button
                      onClick={() => duplicateDayInDb(plan.id, day.id)}
                      className="btn-secondary flex-1 py-2 text-xs"
                    >
                      Duplicate day
                    </button>
                    <button
                      onClick={() => {
                        setRepeatDayId(day.id);
                        setRepeatWeeks(1);
                      }}
                      className="btn-secondary flex-1 py-2 text-xs"
                    >
                      Repeat across weeks…
                    </button>
                  </div>

                  {!openSession && (
                    <button
                      onClick={() => startSession(plan.id, day.id)}
                      className="mt-1 rounded border border-border py-2 text-sm font-medium text-accent"
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

      {repeatDay && (
        <Modal title={`Repeat "${repeatDay.label}"`} onClose={() => setRepeatDayId(null)}>
          <p className="text-sm text-text-secondary">
            Add copies of this day for the next N weeks, keeping the same exercises.
          </p>
          <label className="mt-3 flex items-center gap-2 text-sm text-text">
            Number of additional weeks
            <input
              type="number"
              min={1}
              max={52}
              value={repeatWeeks}
              onChange={(e) => setRepeatWeeks(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 rounded border border-border px-2 py-1.5 text-center"
            />
          </label>
          <button
            onClick={async () => {
              await repeatDayInDb(plan.id, repeatDay.id, repeatWeeks);
              setRepeatDayId(null);
            }}
            className="btn-primary mt-4 w-full py-3"
          >
            Add {repeatWeeks} week{repeatWeeks === 1 ? '' : 's'}
          </button>
        </Modal>
      )}
    </div>
  );
}
