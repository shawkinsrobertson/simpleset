import { Fragment, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ParsedDay, ParsedExercise, ParsedPlan } from '../parser/types';
import type { SourceType } from '../db/types';
import { createPlanFromParsed } from '../db/repo';

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
    raw: '',
  };
}

function emptyDay(week: number): ParsedDay {
  return { tempId: crypto.randomUUID(), week, label: 'New Day', exercises: [] };
}

// Borderless, always-editable cell inputs — the "spreadsheet" feel is the
// point: no separate edit mode, click a cell and type.
const CELL_INPUT = 'w-full rounded bg-transparent px-2 py-2 text-sm focus:bg-brand-50 focus:outline-none';

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
          Parsing free-form docs isn't perfect — click any cell below to fix it before saving.
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

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <th className="sticky left-0 z-10 w-56 bg-white px-2 py-2 shadow-[1px_0_0_rgba(0,0,0,0.06)]">Exercise</th>
              <th className="w-14 px-2 py-2">Sets</th>
              <th className="w-20 px-2 py-2">Reps</th>
              <th className="w-20 px-2 py-2">Time</th>
              <th className="w-20 px-2 py-2">Rest</th>
              <th className="w-24 px-2 py-2">Weight</th>
              <th className="px-2 py-2">Notes</th>
              <th className="w-8 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {plan.days.map((day) => (
              <Fragment key={day.tempId}>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <td colSpan={8} className="px-2 py-1.5">
                    <div className="sticky left-0 flex w-fit items-center gap-2">
                      <input
                        aria-label="Day label"
                        className="min-w-0 flex-1 rounded bg-transparent px-1 py-1 text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none"
                        value={day.label}
                        onChange={(e) => updateDay(day.tempId, { label: e.target.value })}
                      />
                      <label className="flex items-center gap-1 text-xs text-slate-400 whitespace-nowrap">
                        Week
                        <input
                          type="number"
                          min={1}
                          className="w-12 rounded bg-transparent px-1 py-1 text-center text-xs text-slate-700 focus:bg-white focus:outline-none"
                          value={day.week}
                          onChange={(e) => updateDay(day.tempId, { week: Number(e.target.value) || 1 })}
                        />
                      </label>
                      <button
                        onClick={() => addExercise(day.tempId)}
                        className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600"
                      >
                        + Row
                      </button>
                      <button
                        aria-label="Remove day"
                        onClick={() => removeDay(day.tempId)}
                        className="rounded px-1.5 py-1 text-slate-400"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
                {day.exercises.map((ex) => (
                  <tr key={ex.tempId} className="group border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                    <td className="sticky left-0 z-10 bg-white px-1 shadow-[1px_0_0_rgba(0,0,0,0.06)] group-hover:bg-slate-50">
                      <input
                        placeholder="Exercise name"
                        className={`${CELL_INPUT} font-medium`}
                        value={ex.name}
                        onChange={(e) => updateExercise(day.tempId, ex.tempId, { name: e.target.value })}
                      />
                    </td>
                    <td className="px-1">
                      <input
                        placeholder="—"
                        inputMode="numeric"
                        className={`${CELL_INPUT} text-center`}
                        value={ex.targetSets ?? ''}
                        onChange={(e) =>
                          updateExercise(day.tempId, ex.tempId, {
                            targetSets: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                      />
                    </td>
                    <td className="px-1">
                      <input
                        placeholder="—"
                        className={`${CELL_INPUT} text-center`}
                        value={ex.targetReps ?? ''}
                        onChange={(e) => updateExercise(day.tempId, ex.tempId, { targetReps: e.target.value || null })}
                      />
                    </td>
                    <td className="px-1">
                      <input
                        placeholder="—"
                        className={`${CELL_INPUT} text-center`}
                        value={ex.targetTime ?? ''}
                        onChange={(e) => updateExercise(day.tempId, ex.tempId, { targetTime: e.target.value || null })}
                      />
                    </td>
                    <td className="px-1">
                      <input
                        placeholder="—"
                        className={`${CELL_INPUT} text-center`}
                        value={ex.targetRest ?? ''}
                        onChange={(e) => updateExercise(day.tempId, ex.tempId, { targetRest: e.target.value || null })}
                      />
                    </td>
                    <td className="px-1">
                      <input
                        placeholder="—"
                        className={`${CELL_INPUT} text-center`}
                        value={ex.targetWeight ?? ''}
                        onChange={(e) =>
                          updateExercise(day.tempId, ex.tempId, { targetWeight: e.target.value || null })
                        }
                      />
                    </td>
                    <td className="px-1">
                      <input
                        placeholder="—"
                        className={CELL_INPUT}
                        value={ex.notes ?? ''}
                        onChange={(e) => updateExercise(day.tempId, ex.tempId, { notes: e.target.value || null })}
                      />
                    </td>
                    <td className="px-1 text-center">
                      <button
                        aria-label="Remove exercise"
                        onClick={() => removeExercise(day.tempId, ex.tempId)}
                        className="rounded px-1.5 py-1 text-slate-300 hover:text-slate-500"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
                {day.exercises.length === 0 && (
                  <tr className="border-b border-slate-100">
                    <td colSpan={8} className="px-3 py-2 text-xs text-slate-400">
                      No exercises in this day yet — tap "+ Row" above to add one.
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
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
