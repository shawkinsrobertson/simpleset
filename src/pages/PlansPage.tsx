import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { deletePlan, getAllPlans, getPlanVersions, setActivePlan } from '../db/repo';
import type { Plan } from '../db/types';
import { parseCsv, parseFile, parseText } from '../parser';
import { getAccessToken, isDriveConfigured } from '../drive/googleAuth';
import { exportDriveFile, getFileModifiedTime } from '../drive/driveApi';

const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function SyncHistory({ planId }: { planId: string }) {
  const versions = useLiveQuery(() => getPlanVersions(planId), [planId]);
  if (!versions || versions.length === 0) {
    return <p className="px-1 text-xs text-slate-400">No sync history yet.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {versions.map((v) => {
        const counts = v.diffSummary.reduce<Record<string, number>>((acc, e) => {
          acc[e.kind] = (acc[e.kind] ?? 0) + 1;
          return acc;
        }, {});
        const parts = Object.entries(counts)
          .filter(([kind]) => kind !== 'unchanged')
          .map(([kind, n]) => `${n} ${kind}`);
        return (
          <div key={v.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <span className="font-medium text-slate-700">{dateTimeFmt.format(v.importedAt)}</span>
            {parts.length > 0 ? ` — ${parts.join(', ')}` : ' — initial import'}
          </div>
        );
      })}
    </div>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const handleFileResync = async (file: File) => {
    setBusy(true);
    setMessage(null);
    try {
      const parsedPlan = await parseFile(file);
      navigate('/sync-review', {
        state: { planId: plan.id, parsedPlan, sourceModifiedTime: String(file.lastModified) },
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  const handleCheckDrive = async () => {
    if (!plan.sourceFileId) return;
    setBusy(true);
    setMessage(null);
    try {
      const token = await getAccessToken();
      const modifiedTime = await getFileModifiedTime(token, plan.sourceFileId);
      if (plan.sourceModifiedTime && modifiedTime === plan.sourceModifiedTime) {
        setMessage('Up to date — no changes since last sync.');
        return;
      }
      const { text, kind } = await exportDriveFile(token, {
        id: plan.sourceFileId,
        name: plan.sourceFileName ?? plan.name,
        mimeType: plan.sourceMimeType ?? '',
        modifiedTime,
      });
      const parsedPlan = kind === 'sheet' ? parseCsv(text, plan.name) : parseText(text, plan.name);
      navigate('/sync-review', { state: { planId: plan.id, parsedPlan, sourceModifiedTime: modifiedTime } });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not check Google Drive for updates.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-2xl border p-4 ${plan.isActive ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">{plan.name}</p>
          <p className="text-xs text-slate-400">
            {plan.sourceType === 'drive' ? 'Google Drive' : 'File upload'} · Imported {dateFmt.format(plan.importDate)}
          </p>
        </div>
        {plan.isActive && (
          <span className="whitespace-nowrap rounded-full bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white">
            Active
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!plan.isActive && (
          <button
            onClick={() => setActivePlan(plan.id)}
            className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700"
          >
            Make active
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
        >
          Re-sync from file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".docx,.xlsx,.xls,.pdf,.txt,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFileResync(file);
            e.target.value = '';
          }}
        />
        {plan.sourceType === 'drive' && plan.sourceFileId && isDriveConfigured() && (
          <button
            disabled={busy}
            onClick={handleCheckDrive}
            className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            Check for updates
          </button>
        )}
        <button
          onClick={() => {
            if (confirm(`Delete "${plan.name}"? This removes all logged sets for it too.`)) {
              deletePlan(plan.id);
            }
          }}
          className="flex-1 rounded-lg border border-red-100 py-2 text-sm font-medium text-red-500"
        >
          Delete
        </button>
      </div>

      {message && <p className="mt-2 text-xs text-slate-500">{message}</p>}

      <button onClick={() => setShowHistory((s) => !s)} className="mt-3 text-xs font-medium text-slate-400">
        {showHistory ? 'Hide sync history ▲' : 'Sync history ▼'}
      </button>
      {showHistory && (
        <div className="mt-2">
          <SyncHistory planId={plan.id} />
        </div>
      )}
    </div>
  );
}

export default function PlansPage() {
  const plans = useLiveQuery(() => getAllPlans(), []);

  return (
    <div className="flex flex-col gap-5 px-5 pt-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Your plans</h1>
        <Link to="/import" className="rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white">
          + Import
        </Link>
      </div>

      {plans?.length === 0 && (
        <p className="text-sm text-slate-500">No plans imported yet.</p>
      )}

      <div className="flex flex-col gap-2.5">
        {plans?.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>
    </div>
  );
}
