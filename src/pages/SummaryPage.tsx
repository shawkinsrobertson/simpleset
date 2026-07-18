import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../db/db';
import { completeSession, deleteLoggedSet, getLoggedSetsForSession, updateLoggedSet } from '../db/repo';
import { getSessionSummary } from '../lib/stats';
import { useLiveValue } from '../hooks/useLiveValue';
import Card from '../components/Card';
import type { Exercise, LoggedSet } from '../db/types';

function SetRow({ set, exercise }: { set: LoggedSet; exercise: Exercise | undefined }) {
  const isTimed = exercise?.targetTime != null;

  return (
    <div className="flex items-center gap-2 rounded border border-border bg-card p-2">
      <span className="flex-1 truncate text-sm text-text">{exercise?.name ?? 'Exercise'}</span>
      {isTimed ? (
        <input
          type="number"
          inputMode="numeric"
          value={set.timeSeconds ?? ''}
          onChange={(e) => updateLoggedSet(set.id, { timeSeconds: e.target.value === '' ? null : Number(e.target.value) })}
          className="w-16 rounded border border-border bg-bg px-1 py-1 text-center font-mono text-sm font-extralight text-text"
          aria-label="Seconds"
        />
      ) : (
        <input
          type="number"
          inputMode="numeric"
          value={set.reps ?? ''}
          onChange={(e) => updateLoggedSet(set.id, { reps: e.target.value === '' ? null : Number(e.target.value) })}
          className="w-14 rounded border border-border bg-bg px-1 py-1 text-center font-mono text-sm font-extralight text-text"
          aria-label="Reps"
        />
      )}
      <span className="text-text-secondary">×</span>
      <input
        type="number"
        inputMode="decimal"
        value={set.weight ?? ''}
        onChange={(e) => updateLoggedSet(set.id, { weight: e.target.value === '' ? null : Number(e.target.value) })}
        className="w-16 rounded border border-border bg-bg px-1 py-1 text-center font-mono text-sm font-extralight text-text"
        aria-label="Weight"
      />
      <button
        onClick={() => deleteLoggedSet(set.id)}
        aria-label="Delete set"
        className="shrink-0 px-1 text-text-secondary opacity-60 hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}

export default function SummaryPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const { value: session } = useLiveValue(
    () => (sessionId ? db.sessions.get(sessionId) : Promise.resolve(undefined)),
    [sessionId],
  );
  const { value: day } = useLiveValue(
    () => (session ? db.planDays.get(session.dayId) : Promise.resolve(undefined)),
    [session?.dayId],
  );
  const { value: loggedSets } = useLiveValue(
    () => (sessionId ? getLoggedSetsForSession(sessionId) : Promise.resolve([])),
    [sessionId],
  );
  const { value: summary } = useLiveValue(
    () => (sessionId ? getSessionSummary(sessionId) : Promise.resolve({ totalVolume: 0, totalReps: 0, prs: [] })),
    [sessionId, loggedSets],
  );
  const exerciseIds = [...new Set((loggedSets ?? []).map((s) => s.exerciseId))];
  const { value: exercises } = useLiveValue(
    () => Promise.all(exerciseIds.map((id) => db.exercises.get(id))),
    [exerciseIds.join(',')],
  );
  const exerciseById = new Map((exercises ?? []).filter((e): e is Exercise => !!e).map((e) => [e.id, e]));

  if (!sessionId || !session) {
    return (
      <div className="px-5 pt-10 text-center text-text-secondary">
        <p>Nothing to summarize.</p>
        <button onClick={() => navigate('/today')} className="btn-primary mt-4 px-4 py-2">
          Back to today
        </button>
      </div>
    );
  }

  const handleSave = async () => {
    await completeSession(sessionId);
    navigate('/today', { replace: true });
  };

  return (
    <div className="flex flex-col gap-4 px-5 pt-6">
      <div>
        <h1 className="text-xl font-semibold text-text">Workout summary</h1>
        <p className="text-sm text-text-secondary">{day?.label ?? 'Workout'}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3 text-center">
          <p className="font-mono text-xl font-extralight text-text">{Math.round(summary?.totalVolume ?? 0).toLocaleString()}</p>
          <p className="text-[10px] uppercase tracking-wide text-text-secondary">Weight lifted</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="font-mono text-xl font-extralight text-text">{summary?.totalReps ?? 0}</p>
          <p className="text-[10px] uppercase tracking-wide text-text-secondary">Total reps</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="font-mono text-xl font-extralight text-text">{summary?.prs.length ?? 0}</p>
          <p className="text-[10px] uppercase tracking-wide text-text-secondary">PRs</p>
        </Card>
      </div>

      {summary && summary.prs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {summary.prs.map((pr) => (
            <Card key={pr.exerciseId} state="active" className="flex items-center justify-between p-3">
              <span className="text-sm font-semibold text-text">New PR — {pr.exerciseName}</span>
              <span className="font-mono text-sm font-extralight text-accent">{pr.display}</span>
            </Card>
          ))}
        </div>
      )}

      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Sets logged</h2>
        <div className="flex flex-col gap-1.5">
          {loggedSets && loggedSets.length > 0 ? (
            loggedSets.map((s) => <SetRow key={s.id} set={s} exercise={exerciseById.get(s.exerciseId)} />)
          ) : (
            <p className="text-sm text-text-secondary">No sets were logged this workout.</p>
          )}
        </div>
      </div>

      <button onClick={handleSave} className="btn-primary mt-2 w-full py-3.5">
        Save & finish
      </button>
    </div>
  );
}
