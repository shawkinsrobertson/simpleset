import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ParsedPlan } from '../parser/types';
import type { Plan } from '../db/types';
import { confirmSync, getExistingStructureForDiff, getPlan, markPlanChecked, type SyncTiming } from '../db/repo';
import { computeDiff, diffHasChanges, toDiffSummary, type DiffResult, type ExerciseMatch } from '../sync/diff';
import { buildApplyPlan, type RenameResolutions } from '../sync/applyPlan';

interface LocationState {
  planId: string;
  parsedPlan: ParsedPlan;
  sourceModifiedTime: string | null;
}

const KIND_LABEL: Record<string, string> = {
  new: 'New',
  modified: 'Modified',
  removed: 'Removed',
};
const KIND_STYLE: Record<string, string> = {
  new: 'bg-accent/10 text-accent',
  modified: 'bg-blue-50 text-blue-700',
  removed: 'bg-bg text-text-secondary',
};

function ExerciseRow({ m }: { m: ExerciseMatch }) {
  const name = m.parsedExercise?.name ?? m.existingExercise?.name ?? '';
  return (
    <div className="flex items-center justify-between rounded bg-bg px-3 py-2 text-sm">
      <div>
        <p className="font-medium text-text">{name}</p>
        <p className="text-xs text-text-secondary">{m.dayLabel}</p>
      </div>
      {m.detail && <p className="text-right text-xs text-text-secondary">{m.detail}</p>}
    </div>
  );
}

export default function SyncReviewPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const [plan, setPlan] = useState<Plan | null>(null);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [resolutions, setResolutions] = useState<RenameResolutions>({});
  const [timing, setTiming] = useState<SyncTiming>('immediate');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) return;
    (async () => {
      try {
        const [p, structure] = await Promise.all([getPlan(state.planId), getExistingStructureForDiff(state.planId)]);
        if (!p) {
          setLoadError('That plan no longer exists.');
          return;
        }
        setPlan(p);
        setDiff(computeDiff(structure.days, structure.exercisesByDay, state.parsedPlan));
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'Could not compare this file to your current plan.');
      }
    })();
  }, [state]);

  const renamedMatches = useMemo(
    () => diff?.exerciseMatches.filter((m) => m.kind === 'possibly_renamed') ?? [],
    [diff],
  );
  const grouped = useMemo(() => {
    const groups: Record<'new' | 'modified' | 'removed', ExerciseMatch[]> = { new: [], modified: [], removed: [] };
    diff?.exerciseMatches.forEach((m) => {
      if (m.kind === 'new' || m.kind === 'modified' || m.kind === 'removed') groups[m.kind].push(m);
    });
    return groups;
  }, [diff]);
  const dayChanges = useMemo(() => diff?.dayMatches.filter((d) => d.kind !== 'matched') ?? [], [diff]);
  const unchangedCount = useMemo(
    () => diff?.exerciseMatches.filter((m) => m.kind === 'unchanged').length ?? 0,
    [diff],
  );
  const unresolvedCount = renamedMatches.filter((m) => !resolutions[m.existingExercise!.id]).length;

  if (!state) {
    return (
      <div className="px-5 pt-10 text-center text-text-secondary">
        <p>Nothing to review.</p>
        <button className="mt-4 rounded bg-accent px-4 py-2 text-accent-ink" onClick={() => navigate('/plans')}>
          Back to plans
        </button>
      </div>
    );
  }

  if (loadError) {
    return <div className="px-5 pt-10 text-center text-sm text-red-700">{loadError}</div>;
  }

  if (!plan || !diff) return null;

  if (!diffHasChanges(diff)) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 pt-20 text-center">
        <span className="text-4xl">✅</span>
        <h1 className="text-xl font-semibold text-text">No changes detected</h1>
        <p className="text-sm text-text-secondary">"{plan.name}" already matches this file.</p>
        <button
          className="mt-2 rounded bg-accent px-5 py-3 font-semibold text-accent-ink"
          onClick={async () => {
            await markPlanChecked(plan.id, state.sourceModifiedTime);
            navigate('/plans');
          }}
        >
          Done
        </button>
      </div>
    );
  }

  const handleConfirm = async () => {
    if (unresolvedCount > 0 || !diff) return;
    setSaving(true);
    try {
      const applyPlan = buildApplyPlan(plan.id, diff, resolutions);
      const diffSummary = toDiffSummary(diff, resolutions);
      await confirmSync(applyPlan, diffSummary, timing, state.sourceModifiedTime);
      navigate('/plans', { replace: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 px-5 pt-8">
      <div>
        <h1 className="text-2xl font-semibold text-text">Review changes</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Changes found in "{plan.name}". Your logged history is never altered by a re-sync.
        </p>
      </div>

      {dayChanges.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Day changes</h2>
          <div className="flex flex-col gap-1.5">
            {dayChanges.map((d, i) => (
              <div key={i} className="rounded bg-bg px-3 py-2 text-sm">
                {d.kind === 'new' ? (
                  <span className="text-accent">+ New day: {d.parsedDay?.label}</span>
                ) : (
                  <span className="text-text-secondary">− Removed day: {d.existingDay?.label}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {renamedMatches.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
            Possibly renamed — needs your call
          </h2>
          <div className="flex flex-col gap-2">
            {renamedMatches.map((m) => {
              const exId = m.existingExercise!.id;
              const resolved = resolutions[exId];
              return (
                <div key={exId} className="rounded border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm text-text">
                    <span className="font-medium">{m.existingExercise!.name}</span> →{' '}
                    <span className="font-medium">{m.parsedExercise!.name}</span>
                  </p>
                  <p className="text-xs text-text-secondary">{m.dayLabel} · same exercise, renamed? or a different one?</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => setResolutions((r) => ({ ...r, [exId]: 'same' }))}
                      className={`flex-1 rounded py-2 text-xs font-semibold ${
                        resolved === 'same' ? 'bg-accent text-accent-ink' : 'border border-border bg-card text-text-secondary'
                      }`}
                    >
                      Same exercise
                    </button>
                    <button
                      onClick={() => setResolutions((r) => ({ ...r, [exId]: 'different' }))}
                      className={`flex-1 rounded py-2 text-xs font-semibold ${
                        resolved === 'different' ? 'bg-text text-bg' : 'border border-border bg-card text-text-secondary'
                      }`}
                    >
                      Different exercise
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {(['new', 'modified', 'removed'] as const).map(
        (kind) =>
          grouped[kind].length > 0 && (
            <section key={kind}>
              <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                <span className={`rounded-full px-2 py-0.5 ${KIND_STYLE[kind]}`}>{KIND_LABEL[kind]}</span>
                {grouped[kind].length}
              </h2>
              <div className="flex flex-col gap-1.5">
                {grouped[kind].map((m, i) => (
                  <ExerciseRow key={i} m={m} />
                ))}
              </div>
            </section>
          ),
      )}

      {unchangedCount > 0 && (
        <p className="text-center text-xs text-text-secondary">{unchangedCount} exercise{unchangedCount === 1 ? '' : 's'} unchanged</p>
      )}

      <section className="rounded border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-text">Apply changes</h2>
        <div className="mt-2 flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-text">
            <input type="radio" checked={timing === 'immediate'} onChange={() => setTiming('immediate')} />
            Immediately
          </label>
          <label className="flex items-center gap-2 text-sm text-text">
            <input type="radio" checked={timing === 'next_cycle'} onChange={() => setTiming('next_cycle')} />
            From the next cycle (after you finish the current rotation)
          </label>
        </div>
      </section>

      <div className="sticky bottom-20 flex flex-col gap-2 rounded border border-border bg-card/95 p-3 backdrop-blur">
        {unresolvedCount > 0 && (
          <p className="text-center text-xs text-amber-600">
            Resolve {unresolvedCount} rename{unresolvedCount === 1 ? '' : 's'} above to continue
          </p>
        )}
        <button
          disabled={saving || unresolvedCount > 0}
          onClick={handleConfirm}
          className="rounded bg-accent py-3.5 text-center font-semibold text-accent-ink disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Confirm sync'}
        </button>
      </div>
    </div>
  );
}
