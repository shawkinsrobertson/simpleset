import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ParsedExercise } from '../../parser/types';
import { classifyRepsOrTime, repsOrTimeDisplay } from '../../lib/duration';
import { useLongPress } from '../../hooks/useLongPress';

const FIELD_INPUT =
  'w-full rounded border border-border bg-card px-2 py-2 text-sm focus:border-accent focus:outline-none sm:rounded sm:border-0 sm:bg-transparent sm:px-2 sm:py-2 sm:focus:bg-accent/10';

interface ExerciseRowProps {
  exercise: ParsedExercise;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onEnterSelectionMode: () => void;
  onUpdate: (patch: Partial<ParsedExercise>) => void;
  onOpenMenu: () => void;
}

export default function ExerciseRow({
  exercise,
  selectionMode,
  selected,
  onToggleSelect,
  onEnterSelectionMode,
  onUpdate,
  onOpenMenu,
}: ExerciseRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: exercise.tempId,
  });
  const longPress = useLongPress(onEnterSelectionMode);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleRepsOrTimeChange = (value: string) => {
    onUpdate(classifyRepsOrTime(value));
  };

  const handleBodyClick = () => {
    if (selectionMode) onToggleSelect();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...longPress}
      className={`rounded border bg-card p-2.5 sm:rounded-none sm:border-0 sm:border-b sm:border-border sm:p-1 sm:last:border-b-0 ${
        isDragging ? 'opacity-50' : ''
      } ${selected ? 'border-accent bg-accent/10' : 'border-border'}`}
    >
      {/* Mobile card layout */}
      <div className="sm:hidden">
        <div className="flex items-center gap-2">
          {selectionMode ? (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="h-5 w-5 shrink-0 accent-accent"
              aria-label="Select exercise"
            />
          ) : (
            <button
              {...attributes}
              {...listeners}
              aria-label="Drag to reorder"
              className="flex h-8 w-8 shrink-0 items-center justify-center text-text-secondary active:text-text-secondary"
            >
              ☰
            </button>
          )}
          <input
            placeholder="Exercise name"
            className={`${FIELD_INPUT} flex-1 font-medium`}
            value={exercise.name}
            onClick={handleBodyClick}
            onChange={(e) => onUpdate({ name: e.target.value })}
            disabled={selectionMode}
          />
          {!selectionMode && (
            <button
              aria-label="Row actions"
              onClick={onOpenMenu}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary"
            >
              ⋮
            </button>
          )}
        </div>
        <div className="mt-1.5 grid grid-cols-4 gap-1.5" onClick={handleBodyClick}>
          <div>
            <label className="block text-[10px] font-medium uppercase text-text-secondary">Sets</label>
            <input
              placeholder="—"
              inputMode="numeric"
              className={`${FIELD_INPUT} text-center`}
              value={exercise.targetSets ?? ''}
              onChange={(e) => onUpdate({ targetSets: e.target.value ? Number(e.target.value) : null })}
              disabled={selectionMode}
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase text-text-secondary">Reps/Time</label>
            <input
              placeholder="—"
              className={`${FIELD_INPUT} text-center`}
              value={repsOrTimeDisplay(exercise.targetReps, exercise.targetTime)}
              onChange={(e) => handleRepsOrTimeChange(e.target.value)}
              disabled={selectionMode}
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase text-text-secondary">Rest</label>
            <input
              placeholder="—"
              className={`${FIELD_INPUT} text-center`}
              value={exercise.targetRest ?? ''}
              onChange={(e) => onUpdate({ targetRest: e.target.value || null })}
              disabled={selectionMode}
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase text-text-secondary">Weight</label>
            <input
              placeholder="—"
              className={`${FIELD_INPUT} text-center`}
              value={exercise.targetWeight ?? ''}
              onChange={(e) => onUpdate({ targetWeight: e.target.value || null })}
              disabled={selectionMode}
            />
          </div>
        </div>
        <input
          placeholder="Notes"
          className={`${FIELD_INPUT} mt-1.5`}
          value={exercise.notes ?? ''}
          onClick={handleBodyClick}
          onChange={(e) => onUpdate({ notes: e.target.value || null })}
          disabled={selectionMode}
        />
      </div>

      {/* Desktop / tablet row layout */}
      <div className="hidden sm:flex sm:items-center sm:gap-1">
        {selectionMode ? (
          <div className="flex h-7 w-5 shrink-0 items-center justify-center">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="h-4 w-4 accent-accent"
              aria-label="Select exercise"
            />
          </div>
        ) : (
          <button
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
            className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center text-text-secondary active:cursor-grabbing"
          >
            ☰
          </button>
        )}
        <div className="w-56 shrink-0">
          <input
            placeholder="Exercise name"
            className={`${FIELD_INPUT} font-medium`}
            value={exercise.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            disabled={selectionMode}
          />
        </div>
        <div className="w-14 shrink-0">
          <input
            placeholder="—"
            inputMode="numeric"
            className={`${FIELD_INPUT} text-center`}
            value={exercise.targetSets ?? ''}
            onChange={(e) => onUpdate({ targetSets: e.target.value ? Number(e.target.value) : null })}
            disabled={selectionMode}
          />
        </div>
        <div className="w-24 shrink-0">
          <input
            placeholder="—"
            className={`${FIELD_INPUT} text-center`}
            value={repsOrTimeDisplay(exercise.targetReps, exercise.targetTime)}
            onChange={(e) => handleRepsOrTimeChange(e.target.value)}
            disabled={selectionMode}
          />
        </div>
        <div className="w-20 shrink-0">
          <input
            placeholder="—"
            className={`${FIELD_INPUT} text-center`}
            value={exercise.targetRest ?? ''}
            onChange={(e) => onUpdate({ targetRest: e.target.value || null })}
            disabled={selectionMode}
          />
        </div>
        <div className="w-24 shrink-0">
          <input
            placeholder="—"
            className={`${FIELD_INPUT} text-center`}
            value={exercise.targetWeight ?? ''}
            onChange={(e) => onUpdate({ targetWeight: e.target.value || null })}
            disabled={selectionMode}
          />
        </div>
        <div className="min-w-0 flex-1">
          <input
            placeholder="Notes"
            className={FIELD_INPUT}
            value={exercise.notes ?? ''}
            onChange={(e) => onUpdate({ notes: e.target.value || null })}
            disabled={selectionMode}
          />
        </div>
        {!selectionMode && (
          <button
            aria-label="Row actions"
            onClick={onOpenMenu}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-secondary hover:text-text-secondary"
          >
            ⋮
          </button>
        )}
      </div>
    </div>
  );
}
