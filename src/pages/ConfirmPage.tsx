import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ParsedDay, ParsedExercise, ParsedPlan } from '../parser/types';
import type { SourceType } from '../db/types';
import { createPlanFromParsed } from '../db/repo';

interface LocationState {
  parsedPlan: ParsedPlan;
  sourceType: SourceType;
  sourceFileName?: string;
  sourceFileId?: string;
}

function emptyExercise(): ParsedExercise {
  return {
    tempId: crypto.randomUUID(),
    name: '',
    targetSets: null,
    targetReps: null,
    targetWeight: null,
    notes: null,
    raw: '',
  };
}

function emptyDay(week: number): ParsedDay {
  return { tempId: crypto.randomUUID(), week, label: 'New Day', exercises: [] };
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

  const updateExercise = (dayTempId: string, exTempId: string, patch: Partial<ParsedExercise>) => {
    setPlan(
      (p) =>
        p && {
          ...p,
          days: p.days.map((d) =>
            d.tempId === dayTempId
              ? { ...d, exercises: d.exercises.map((e) => (e.tempId === exTempId ? { ...e, ...patch } : e)) }
              : d,
          ),
        },
    );
  };

  const removeExercise = (dayTempId: string, exTempId: string) => {
    setPlan(
      (p) =>
        p && {
          ...p,
          days: p.days.map((d) =>
            d.tempId === dayTempId ? { ...d, exercises: d.exercises.filter((e) => e.tempId !== exTempId) } : d,
          ),
        },
    );
  };

  const addExercise = (dayTempId: string) => {
    setPlan(
      (p) =>
        p && {
          ...p,
          days: p.days.map((d) =>
            d.tempId === dayTempId ? { ...d, exercises: [...d.exercises, emptyExercise()] } : d,
          ),
        },
    );
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
      const savedPlan = await createPlanFromParsed(
        cleaned,
        state.sourceType,
        state.sourceFileName,
        state.sourceFileId,
      );
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
          Parsing free-form docs isn't perfect — double check the details below before saving.
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
          <div key={day.tempId} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Day label
                </label>
                <input
                  className="mt-0.5 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-900"
                  value={day.label}
                  onChange={(e) => updateDay(day.tempId, { label: e.target.value })}
                />
              </div>
              <div className="w-16">
                <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Week</label>
                <input
                  type="number"
                  min={1}
                  className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-center"
                  value={day.week}
                  onChange={(e) => updateDay(day.tempId, { week: Number(e.target.value) || 1 })}
                />
              </div>
              <button
                aria-label="Remove day"
                onClick={() => removeDay(day.tempId)}
                className="mt-4 rounded-lg px-2 py-1.5 text-slate-400"
              >
                ✕
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {day.exercises.map((ex) => (
                <div key={ex.tempId} className="rounded-xl bg-slate-50 p-2.5">
                  <div className="flex gap-2">
                    <input
                      placeholder="Exercise name"
                      className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-medium"
                      value={ex.name}
                      onChange={(e) => updateExercise(day.tempId, ex.tempId, { name: e.target.value })}
                    />
                    <button
                      aria-label="Remove exercise"
                      onClick={() => removeExercise(day.tempId, ex.tempId)}
                      className="rounded-lg px-2 text-slate-400"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                    <input
                      placeholder="Sets"
                      inputMode="numeric"
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm"
                      value={ex.targetSets ?? ''}
                      onChange={(e) =>
                        updateExercise(day.tempId, ex.tempId, {
                          targetSets: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                    <input
                      placeholder="Reps"
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm"
                      value={ex.targetReps ?? ''}
                      onChange={(e) => updateExercise(day.tempId, ex.tempId, { targetReps: e.target.value || null })}
                    />
                    <input
                      placeholder="Weight"
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm"
                      value={ex.targetWeight ?? ''}
                      onChange={(e) =>
                        updateExercise(day.tempId, ex.tempId, { targetWeight: e.target.value || null })
                      }
                    />
                  </div>
                </div>
              ))}
              <button
                onClick={() => addExercise(day.tempId)}
                className="rounded-lg border border-dashed border-slate-300 py-1.5 text-sm text-slate-500"
              >
                + Add exercise
              </button>
            </div>
          </div>
        ))}

        <button
          onClick={addDay}
          className="rounded-xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-500"
        >
          + Add day
        </button>
      </div>

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
