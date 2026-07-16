import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { deletePlan, getAllPlans, setActivePlan } from '../db/repo';

const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

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
          <div
            key={plan.id}
            className={`rounded-2xl border p-4 ${plan.isActive ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-white'}`}
          >
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
            <div className="mt-3 flex gap-2">
              {!plan.isActive && (
                <button
                  onClick={() => setActivePlan(plan.id)}
                  className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700"
                >
                  Make active
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
          </div>
        ))}
      </div>
    </div>
  );
}
