import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ExerciseGroupType, ParsedDay, ParsedExercise, ParsedPlan } from '../parser/types';
import type { SourceType } from '../db/types';
import { createPlanFromParsed } from '../db/repo';
import { cloneDayForWeek, repeatDayAcrossWeeks } from '../lib/duplicateDay';
import DayBlock from '../components/planGrid/DayBlock';

interface LocationState {
  parsedPlan: ParsedPlan;
  sourceType: SourceType;
  sourceFileName?: string;
  sourceFileId?: string;
  sourceMimeType?: string;
  sourceModifiedTime?: string | null;
}

function emptyExercise(): ParsedExercise {
  return {
    tempId: crypto.randomUUID(),
    name: '',
    targetSets: null,
    targetReps: null,
    targetWeight: null,
    targetTime: null,
    targetRest: null,
    notes: null,
    groupTempId: null,
    raw: '',
  };
}

function emptyDay(week: number): ParsedDay {
  return { tempId: crypto.randomUUID(), week, label: 'New Day', exercises: [], groups: [] };
}

function groupOrdinalLabel(existingGroups: { label: string | null }[], type: ExerciseGroupType): string {
  const count = existingGroups.filter((g) => g.label?.toLowerCase().startsWith(type)).length;
  const letter = String.fromCharCode(65 + count); // A, B, C...
  return `${type === 'circuit' ? 'Circuit' : 'Superset'} ${letter}`;
}

export default function ConfirmPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const [plan, setPlan] = useState<ParsedPlan | null>(state?.parsedPlan ?? null);
  const [saving, setSaving] = useState(false);

  if (!state || !plan) {
    return (
      <div className="px-5 pt-10 text-center text-slate-500">
        <p>Nothing to confirm yet.</p>
        <button
          className="mt-4 rounded-xl bg-brand-600 px-4 py-2 text-white"
          onClick={() => navigate('/import')}
        >
          Import a plan
        </button>
      </div>
    );
  }

  const updateDay = (dayTempId: string, patch: Partial<ParsedDay>) => {
    setPlan((p) => p && { ...p, days: p.days.map((d) => (d.tempId === dayTempId ? { ...d, ...patch } : d)) });
  };

  const removeDay = (dayTempId: string) => {
    setPlan((p) => p && { ...p, days: p.days.filter((d) => d.tempId !== dayTempId) });
  };

  const addDay = () => {
    setPlan((p) => p && { ...p, days: [...p.days, emptyDay(p.days.at(-1)?.week ?? 1)] });
  };

  const duplicateDay = (dayTempId: string) => {
    setPlan((p) => {
      if (!p) return p;
      const idx = p.days.findIndex((d) => d.tempId === dayTempId);
      if (idx === -1) return p;
      const clone = cloneDayForWeek(p.days[idx], p.days[idx].week, `${p.days[idx].label} (copy)`);
      const days = [...p.days];
      days.splice(idx + 1, 0, clone);
      return { ...p, days };
    });
  };

  const repeatDay = (dayTempId: string, weekCount: number) => {
    setPlan((p) => {
      if (!p) return p;
      const idx = p.days.findIndex((d) => d.tempId === dayTempId);
      if (idx === -1) return p;
      const startWeek = p.days[idx].week + 1;
      const copies = repeatDayAcrossWeeks(p.days[idx], weekCount, startWeek);
      const days = [...p.days];
      days.splice(idx + 1, 0, ...copies);
      return { ...p, days };
    });
  };

  const withDay = (dayTempId: string, fn: (d: ParsedDay) => ParsedDay) => {
    setPlan((p) => p && { ...p, days: p.days.map((d) => (d.tempId === dayTempId ? fn(d) : d)) });
  };

  const updateExercise = (dayTempId: string, exTempId: string, patch: Partial<ParsedExercise>) => {
    withDay(dayTempId, (d) => ({
      ...d,
      exercises: d.exercises.map((e) => (e.tempId === exTempId ? { ...e, ...patch } : e)),
    }));
  };

  const removeExercise = (dayTempId: string, exTempId: string) => {
    withDay(dayTempId, (d) => ({ ...d, exercises: d.exercises.filter((e) => e.tempId !== exTempId) }));
  };

  const addExercise = (dayTempId: string) => {
    withDay(dayTempId, (d) => ({ ...d, exercises: [...d.exercises, emptyExercise()] }));
  };

  const insertExercise = (dayTempId: string, afterExTempId: string | null) => {
    withDay(dayTempId, (d) => {
      const exercises = [...d.exercises];
      const insertAt = afterExTempId ? exercises.findIndex((e) => e.tempId === afterExTempId) + 1 : 0;
      exercises.splice(insertAt, 0, emptyExercise());
      return { ...d, exercises };
    });
  };

  const duplicateExercise = (dayTempId: string, exTempId: string) => {
    withDay(dayTempId, (d) => {
      const idx = d.exercises.findIndex((e) => e.tempId === exTempId);
      if (idx === -1) return d;
      const clone = { ...d.exercises[idx], tempId: crypto.randomUUID() };
      const exercises = [...d.exercises];
      exercises.splice(idx + 1, 0, clone);
      return { ...d, exercises };
    });
  };

  const reorderExercises = (dayTempId: string, newOrderTempIds: string[]) => {
    withDay(dayTempId, (d) => {
      const byId = new Map(d.exercises.map((e) => [e.tempId, e]));
      return { ...d, exercises: newOrderTempIds.map((id) => byId.get(id)!) };
    });
  };

  const groupExercises = (dayTempId: string, exTempIds: string[], type: ExerciseGroupType) => {
    withDay(dayTempId, (d) => {
      const groupTempId = crypto.randomUUID();
      const label = groupOrdinalLabel(d.groups, type);
      const idsToGroup = new Set(exTempIds);
      return {
        ...d,
        groups: [...d.groups, { tempId: groupTempId, type, label }],
        exercises: d.exercises.map((e) => (idsToGroup.has(e.tempId) ? { ...e, groupTempId } : e)),
      };
    });
  };

  const ungroup = (dayTempId: string, groupTempId: string) => {
    withDay(dayTempId, (d) => ({
      ...d,
      groups: d.groups.filter((g) => g.tempId !== groupTempId),
      exercises: d.exercises.map((e) => (e.groupTempId === groupTempId ? { ...e, groupTempId: null } : e)),
    }));
  };

  const handleSave = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const cleaned: ParsedPlan = {
        ...plan,
        days: plan.days
          .map((d) => ({ ...d, exercises: d.exercises.filter((e) => e.name.trim().length > 0) }))
          .filter((d) => d.exercises.length > 0),
      };
      const savedPlan = await createPlanFromParsed(cleaned, {
        sourceType: state.sourceType,
        sourceFileName: state.sourceFileName,
        sourceFileId: state.sourceFileId,
        sourceMimeType: state.sourceMimeType,
        sourceModifiedTime: state.sourceModifiedTime,
      });
      navigate('/today', { replace: true, state: { justImportedPlanId: savedPlan.id } });
    } finally {
      setSaving(false);
    }
  };

  const totalExercises = plan.days.reduce((sum, d) => sum + d.exercises.length, 0);

  return (
    <div className="flex flex-col gap-5 px-5 pt-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Confirm your plan</h1>
        <p className="mt-1 text-sm text-slate-500">
          Parsing free-form docs isn't perfect — click any field below to fix it before saving.
        </p>
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Plan name</label>
        <input
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base font-medium text-slate-900"
          value={plan.name}
          onChange={(e) => setPlan((p) => p && { ...p, name: e.target.value })}
        />
      </div>

      {plan.warnings.length > 0 && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Heads up:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {plan.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {plan.days.map((day) => (
          <DayBlock
            key={day.tempId}
            day={day}
            onUpdateDay={(patch) => updateDay(day.tempId, patch)}
            onDeleteDay={() => removeDay(day.tempId)}
            onDuplicateDay={() => duplicateDay(day.tempId)}
            onRepeatDay={(weekCount) => repeatDay(day.tempId, weekCount)}
            onAddExercise={() => addExercise(day.tempId)}
            onInsertExercise={(afterExTempId) => insertExercise(day.tempId, afterExTempId)}
            onDuplicateExercise={(exTempId) => duplicateExercise(day.tempId, exTempId)}
            onUpdateExercise={(exTempId, patch) => updateExercise(day.tempId, exTempId, patch)}
            onDeleteExercise={(exTempId) => removeExercise(day.tempId, exTempId)}
            onReorderExercises={(newOrder) => reorderExercises(day.tempId, newOrder)}
            onGroupExercises={(exTempIds, type) => groupExercises(day.tempId, exTempIds, type)}
            onUngroup={(groupTempId) => ungroup(day.tempId, groupTempId)}
          />
        ))}
      </div>

      <button
        onClick={addDay}
        className="rounded-xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-500"
      >
        + Add day
      </button>

      <div className="sticky bottom-20 flex flex-col gap-2 rounded-2xl bg-white/95 p-3 shadow-lg backdrop-blur">
        <p className="text-center text-xs text-slate-400">
          {plan.days.length} day{plan.days.length === 1 ? '' : 's'}, {totalExercises} exercise
          {totalExercises === 1 ? '' : 's'}
        </p>
        <button
          disabled={saving || totalExercises === 0}
          onClick={handleSave}
          className="rounded-xl bg-brand-600 py-3.5 text-center font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save plan'}
        </button>
      </div>
    </div>
  );
}
