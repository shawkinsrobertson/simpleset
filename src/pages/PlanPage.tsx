import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DndContext, type DragEndEvent, PointerSensor, TouchSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  archiveDayInDb,
  duplicateDayInDb,
  getExerciseGroupsForPlan,
  getExercisesForPlan,
  getPlanDays,
  getOpenSession,
  repeatDayInDb,
  reorderDaysInDb,
  startSession,
} from '../db/repo';
import { useActivePlan } from '../hooks/useActivePlan';
import { useLiveValue } from '../hooks/useLiveValue';
import Modal from '../components/Modal';
import type { Exercise, ExerciseGroup, PlanDay } from '../db/types';
import { groupIntoRuns } from '../lib/groupRuns';

interface PlanDayCardProps {
  day: PlanDay;
  dayExercises: Exercise[];
  dayGroups: ExerciseGroup[];
  isOpen: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRepeat: () => void;
  onStart: () => void;
  canStart: boolean;
}

function PlanDayCard({
  day,
  dayExercises,
  dayGroups,
  isOpen,
  onToggle,
  onDelete,
  onDuplicate,
  onRepeat,
  onStart,
  canStart,
}: PlanDayCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: day.id });
  const runs = groupIntoRuns(dayExercises, dayGroups);
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded border border-border bg-card p-4 ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="flex h-8 w-6 shrink-0 cursor-grab items-center justify-center text-text-secondary active:cursor-grabbing"
        >
          ☰
        </button>
        <button className="flex flex-1 items-center justify-between text-left" onClick={onToggle}>
          <div>
            <p className="font-semibold text-text">{day.label}</p>
            <p className="text-xs text-text-secondary">
              Week {day.week} · {dayExercises.length} exercise{dayExercises.length === 1 ? '' : 's'}
            </p>
          </div>
          <span className="text-text-secondary">{isOpen ? '▲' : '▼'}</span>
        </button>
        <button
          aria-label="Delete day"
          onClick={onDelete}
          className="shrink-0 rounded px-1.5 py-1 opacity-50 hover:opacity-100"
        >
          <img src="/icons/icon-delete-light.png" alt="Delete" className="h-5 w-5 dark:hidden" draggable={false} />
          <img src="/icons/icon-delete-dark.png" alt="Delete" className="hidden h-5 w-5 dark:block" draggable={false} />
        </button>
      </div>

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
                  <span className="font-mono font-extralight text-text-secondary">
                    {ex.targetSets ?? '—'}×{ex.targetReps ?? ex.targetTime ?? '—'}
                    {ex.targetWeight ? ` @ ${ex.targetWeight}` : ''}
                    {ex.targetRest ? ` · rest ${ex.targetRest}` : ''}
                  </span>
                </div>
              ))}
            </div>
          ))}

          <div className="mt-1 flex gap-2">
            <button onClick={onDuplicate} className="btn-secondary flex-1 py-2 text-xs">
              Duplicate day
            </button>
            <button onClick={onRepeat} className="btn-secondary flex-1 py-2 text-xs">
              Repeat across weeks…
            </button>
          </div>

          {canStart && (
            <button onClick={onStart} className="mt-1 rounded border border-border py-2 text-sm font-medium text-accent">
              Start this day
            </button>
          )}
        </div>
      )}
    </div>
  );
}

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !days) return;
    const ids = days.map((d) => d.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    reorderDaysInDb(arrayMove(ids, oldIndex, newIndex));
  };

  return (
    <div className="flex flex-col gap-4 px-5 pt-8">
      <div>
        <h1 className="text-2xl font-semibold text-text">{plan.name}</h1>
        <p className="text-sm text-text-secondary">{days?.length ?? 0} days in this program</p>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={(days ?? []).map((d) => d.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2.5">
            {days?.map((day) => (
              <PlanDayCard
                key={day.id}
                day={day}
                dayExercises={(exercisesByDay.get(day.id) ?? []).sort((a, b) => a.order - b.order)}
                dayGroups={groupsByDay.get(day.id) ?? []}
                isOpen={expanded === day.id}
                onToggle={() => setExpanded(expanded === day.id ? null : day.id)}
                onDelete={() => {
                  if (confirm(`Delete "${day.label}"? Past sessions logged against it stay in your history.`)) {
                    archiveDayInDb(plan.id, day.id);
                  }
                }}
                onDuplicate={() => duplicateDayInDb(plan.id, day.id)}
                onRepeat={() => {
                  setRepeatDayId(day.id);
                  setRepeatWeeks(1);
                }}
                onStart={() => startSession(plan.id, day.id)}
                canStart={!openSession}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

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
