import { useMemo, useState } from 'react';
import { DndContext, type DragEndEvent, PointerSensor, TouchSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import type { ExerciseGroupType, ParsedDay, ParsedExercise, ParsedGroup } from '../../parser/types';
import ExerciseRow from './ExerciseRow';
import RowActionMenu, { type RowAction } from '../RowActionMenu';
import Modal from '../Modal';

interface Run {
  group: ParsedGroup | null;
  exercises: ParsedExercise[];
}

function groupIntoRuns(exercises: ParsedExercise[], groups: ParsedGroup[]): Run[] {
  const groupByTempId = new Map(groups.map((g) => [g.tempId, g]));
  const runs: Run[] = [];
  for (const ex of exercises) {
    const g = ex.groupTempId ? (groupByTempId.get(ex.groupTempId) ?? null) : null;
    const last = runs.at(-1);
    if (last && (last.group?.tempId ?? null) === (g?.tempId ?? null)) {
      last.exercises.push(ex);
    } else {
      runs.push({ group: g, exercises: [ex] });
    }
  }
  return runs;
}

export interface DayBlockProps {
  day: ParsedDay;
  onUpdateDay: (patch: Partial<ParsedDay>) => void;
  onDeleteDay: () => void;
  onDuplicateDay: () => void;
  onRepeatDay: (weekCount: number) => void;
  onAddExercise: () => void;
  onInsertExercise: (afterExTempId: string | null) => void;
  onDuplicateExercise: (exTempId: string) => void;
  onUpdateExercise: (exTempId: string, patch: Partial<ParsedExercise>) => void;
  onDeleteExercise: (exTempId: string) => void;
  onReorderExercises: (newOrderTempIds: string[]) => void;
  onGroupExercises: (exTempIds: string[], type: ExerciseGroupType) => void;
  onUngroup: (groupTempId: string) => void;
  /** Split this day at exTempId: everything from that row onward becomes a new day. */
  onSplitDayAt?: (exTempId: string) => void;
}

export default function DayBlock({
  day,
  onUpdateDay,
  onDeleteDay,
  onDuplicateDay,
  onRepeatDay,
  onAddExercise,
  onInsertExercise,
  onDuplicateExercise,
  onUpdateExercise,
  onDeleteExercise,
  onReorderExercises,
  onGroupExercises,
  onUngroup,
  onSplitDayAt,
}: DayBlockProps) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuForExTempId, setMenuForExTempId] = useState<string | null>(null);
  const [repeatPromptOpen, setRepeatPromptOpen] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(1);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const runs = useMemo(() => groupIntoRuns(day.exercises, day.groups), [day.exercises, day.groups]);

  const enterSelectionMode = (exTempId: string) => {
    setSelectionMode(true);
    setSelected(new Set([exTempId]));
  };

  const toggleSelect = (exTempId: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(exTempId)) next.delete(exTempId);
      else next.add(exTempId);
      return next;
    });
  };

  const cancelSelection = () => {
    setSelectionMode(false);
    setSelected(new Set());
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = day.exercises.map((e) => e.tempId);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    onReorderExercises(arrayMove(ids, oldIndex, newIndex));
  };

  const menuExIdx = menuForExTempId ? day.exercises.findIndex((e) => e.tempId === menuForExTempId) : -1;
  const menuEx = menuExIdx !== -1 ? day.exercises[menuExIdx] : null;
  const menuExAbove = menuExIdx > 0 ? day.exercises[menuExIdx - 1] : null;

  /** Append this row's name as a note on the exercise directly above, then delete this row. */
  const mergeIntoNoteAbove = () => {
    if (!menuEx || !menuExAbove) return;
    const joined = [menuExAbove.notes, menuEx.name].filter(Boolean).join(' · ');
    onUpdateExercise(menuExAbove.tempId, { notes: joined });
    onDeleteExercise(menuEx.tempId);
  };

  const menuActions: RowAction[] = menuForExTempId
    ? [
        { label: 'Insert row above', onClick: () => onInsertExercise(previousExTempId(day.exercises, menuForExTempId)) },
        { label: 'Insert row below', onClick: () => onInsertExercise(menuForExTempId) },
        { label: 'Duplicate row', onClick: () => onDuplicateExercise(menuForExTempId) },
        ...(onSplitDayAt
          ? [{ label: 'Start new day here', onClick: () => onSplitDayAt(menuForExTempId) }]
          : []),
        ...(menuExAbove
          ? [{ label: 'Move to notes on row above', onClick: mergeIntoNoteAbove }]
          : []),
        { label: 'Select multiple…', onClick: () => enterSelectionMode(menuForExTempId) },
        { label: 'Delete row', onClick: () => onDeleteExercise(menuForExTempId), destructive: true },
      ]
    : [];

  const selectedGroupIds = new Set(
    day.exercises.filter((e) => selected.has(e.tempId) && e.groupTempId).map((e) => e.groupTempId!),
  );

  return (
    <div className="card-lift rounded border border-border bg-card p-2.5 sm:p-2">
      <div className="rounded bg-bg px-2 py-1.5">
        <div className="flex items-center gap-2">
          <input
            aria-label="Day label"
            className="min-w-0 flex-1 rounded bg-transparent px-1 py-1 text-sm font-semibold text-text focus:bg-card focus:outline-none"
            value={day.label}
            onChange={(e) => onUpdateDay({ label: e.target.value })}
          />
          <label className="flex shrink-0 items-center gap-1 text-xs text-text-secondary whitespace-nowrap">
            Wk
            <input
              type="number"
              min={1}
              className="w-10 rounded bg-transparent px-1 py-1 text-center text-xs text-text focus:bg-card focus:outline-none"
              value={day.week}
              onChange={(e) => onUpdateDay({ week: Number(e.target.value) || 1 })}
            />
          </label>
          <button
            aria-label="Delete day"
            onClick={onDeleteDay}
            className="shrink-0 rounded px-1.5 py-1 text-text-secondary"
          >
            ✕
          </button>
        </div>
        <div className="mt-1 flex gap-1.5">
          <button
            onClick={onDuplicateDay}
            className="rounded border border-border bg-card px-2 py-1 text-xs font-medium text-text-secondary"
          >
            Duplicate
          </button>
          <button
            onClick={() => setRepeatPromptOpen(true)}
            className="rounded border border-border bg-card px-2 py-1 text-xs font-medium text-text-secondary"
          >
            Repeat…
          </button>
        </div>
      </div>

      {day.exercises.length > 0 && (
        <div className="hidden items-center gap-1 px-2 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary sm:flex">
          <div className="w-5 shrink-0" />
          <div className="w-56 shrink-0">Exercise</div>
          <div className="w-14 shrink-0 text-center">Sets</div>
          <div className="w-24 shrink-0 text-center">Reps/Time</div>
          <div className="w-20 shrink-0 text-center">Rest</div>
          <div className="w-24 shrink-0 text-center">Weight</div>
          <div className="min-w-0 flex-1">Notes</div>
          <div className="w-7 shrink-0" />
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={day.exercises.map((e) => e.tempId)} strategy={verticalListSortingStrategy}>
          <div className="mt-2 flex flex-col gap-2">
            {runs.map((run, runIdx) => (
              <div
                key={run.group?.tempId ?? `solo-${runIdx}`}
                className={run.group ? 'rounded border-l-4 border-accent bg-accent/10 py-1.5 pl-1.5 pr-1' : ''}
              >
                {run.group && (
                  <button
                    onClick={() => onUngroup(run.group!.tempId)}
                    className="mb-1 ml-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent"
                    title="Tap to ungroup"
                  >
                    {run.group.label ?? (run.group.type === 'circuit' ? 'Circuit' : 'Superset')} · Ungroup ✕
                  </button>
                )}
                <div className="flex flex-col gap-1.5">
                  {run.exercises.map((ex) => (
                    <ExerciseRow
                      key={ex.tempId}
                      exercise={ex}
                      selectionMode={selectionMode}
                      selected={selected.has(ex.tempId)}
                      onToggleSelect={() => toggleSelect(ex.tempId)}
                      onEnterSelectionMode={() => enterSelectionMode(ex.tempId)}
                      onUpdate={(patch) => onUpdateExercise(ex.tempId, patch)}
                      onOpenMenu={() => setMenuForExTempId(ex.tempId)}
                    />
                  ))}
                </div>
              </div>
            ))}
            {day.exercises.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-text-secondary">No exercises in this day yet.</p>
            )}
          </div>
        </SortableContext>
      </DndContext>

      <div className="mt-2 flex gap-2">
        <button
          onClick={onAddExercise}
          className="flex-1 rounded border border-dashed border-border py-1.5 text-xs font-medium text-text-secondary"
        >
          + Row
        </button>
        {!selectionMode && day.exercises.length > 1 && (
          <button
            onClick={() => setSelectionMode(true)}
            className="flex-1 rounded border border-dashed border-border py-1.5 text-xs font-medium text-text-secondary"
          >
            Select multiple…
          </button>
        )}
      </div>

      {selectionMode && (
        <div className="fixed inset-x-0 bottom-20 z-40 mx-auto flex max-w-md items-center gap-2 border-t border-border bg-card p-3">
          <span className="text-xs font-medium text-text-secondary">{selected.size} selected</span>
          <div className="ml-auto flex gap-2">
            {selectedGroupIds.size > 0 && (
              <button
                onClick={() => {
                  selectedGroupIds.forEach((gid) => onUngroup(gid));
                  cancelSelection();
                }}
                className="rounded border border-border px-2.5 py-1.5 text-xs font-medium text-text-secondary"
              >
                Ungroup
              </button>
            )}
            <button
              disabled={selected.size < 2}
              onClick={() => {
                onGroupExercises([...selected], 'circuit');
                cancelSelection();
              }}
              className="rounded bg-text px-2.5 py-1.5 text-xs font-medium text-bg disabled:opacity-40"
            >
              Circuit
            </button>
            <button
              disabled={selected.size < 2}
              onClick={() => {
                onGroupExercises([...selected], 'superset');
                cancelSelection();
              }}
              className="rounded bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-ink disabled:opacity-40"
            >
              Superset
            </button>
            <button onClick={cancelSelection} className="rounded px-2.5 py-1.5 text-xs font-medium text-text-secondary">
              Cancel
            </button>
          </div>
        </div>
      )}

      <RowActionMenu open={menuForExTempId !== null} actions={menuActions} onClose={() => setMenuForExTempId(null)} />

      {repeatPromptOpen && (
        <Modal title={`Repeat "${day.label}"`} onClose={() => setRepeatPromptOpen(false)}>
          <p className="text-sm text-text-secondary">
            Create copies of this day for the next N weeks, keeping the same exercises.
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
            onClick={() => {
              onRepeatDay(repeatWeeks);
              setRepeatPromptOpen(false);
            }}
            className="mt-4 w-full rounded bg-accent py-3 text-center font-semibold text-accent-ink"
          >
            Add {repeatWeeks} week{repeatWeeks === 1 ? '' : 's'}
          </button>
        </Modal>
      )}
    </div>
  );
}

function previousExTempId(exercises: ParsedExercise[], tempId: string): string | null {
  const idx = exercises.findIndex((e) => e.tempId === tempId);
  if (idx <= 0) return null;
  return exercises[idx - 1].tempId;
}
