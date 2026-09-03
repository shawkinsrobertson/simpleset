import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../db/db';
import {
  completeSession,
  deleteLoggedSet,
  getLoggedSetsForSession,
  updateExerciseNote,
  updateLoggedSet,
  updateSessionNotes,
} from '../db/repo';
import { getSessionSummary } from '../lib/stats';
import { formatSeconds } from '../lib/targets';
import { useLiveValue } from '../hooks/useLiveValue';
import Card from '../components/Card';
import type { Exercise, LoggedSet, Session } from '../db/types';

/** Compact "8×135" / "45s" read of one logged set, for the collapsed review list. */
function formatSetCompact(set: LoggedSet): string {
  const primary = set.timeSeconds != null ? formatSeconds(set.timeSeconds) : (set.reps ?? '—');
  return set.weight ? `${primary}×${set.weight}` : `${primary}`;
}

function SetInputRow({ set, exercise }: { set: LoggedSet; exercise: Exercise | undefined }) {
  const isTimed = exercise?.targetTime != null;

  return (
    <div className="flex items-center gap-2 rounded border border-border bg-bg p-2">
      {isTimed ? (
        <input
          type="number"
          inputMode="numeric"
          value={set.timeSeconds ?? ''}
          onChange={(e) => updateLoggedSet(set.id, { timeSeconds: e.target.value === '' ? null : Number(e.target.value) })}
          className="w-16 rounded border border-border bg-card px-1 py-1 text-center font-mono text-sm font-extralight text-text"
          aria-label="Seconds"
        />
      ) : (
        <input
          type="number"
          inputMode="numeric"
          value={set.reps ?? ''}
          onChange={(e) => updateLoggedSet(set.id, { reps: e.target.value === '' ? null : Number(e.target.value) })}
          className="w-14 rounded border border-border bg-card px-1 py-1 text-center font-mono text-sm font-extralight text-text"
          aria-label="Reps"
        />
      )}
      <span className="text-text-secondary">×</span>
      <input
        type="number"
        inputMode="decimal"
        value={set.weight ?? ''}
        onChange={(e) => updateLoggedSet(set.id, { weight: e.target.value === '' ? null : Number(e.target.value) })}
        className="w-16 rounded border border-border bg-card px-1 py-1 text-center font-mono text-sm font-extralight text-text"
        aria-label="Weight"
      />
      <button
        onClick={() => deleteLoggedSet(set.id)}
        aria-label="Delete set"
        className="ml-auto shrink-0 px-1 text-text-secondary opacity-60 hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}

function ExerciseEditCard({
  exercise,
  sets,
  note,
  onSaveNote,
}: {
  exercise: Exercise | undefined;
  sets: LoggedSet[];
  note: string;
  onSaveNote: (value: string) => void;
}) {
  const [draft, setDraft] = useState(note);

  return (
    <Card className="p-3">
      <p className="text-sm font-semibold text-text">{exercise?.name ?? 'Exercise'}</p>
      <div className="mt-2 flex flex-col gap-1.5">
        {sets.map((set) => (
          <SetInputRow key={set.id} set={set} exercise={exercise} />
        ))}
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onSaveNote(draft)}
        placeholder="Note on this exercise…"
        rows={2}
        className="mt-2 w-full rounded border border-border bg-bg p-2 text-sm text-text"
      />
    </Card>
  );
}

function WorkoutNotesField({ session }: { session: Session }) {
  const [draft, setDraft] = useState(session.notes ?? '');

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">Workout notes</label>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => updateSessionNotes(session.id, draft)}
        placeholder="How did this workout go?"
        rows={3}
        className="w-full rounded border border-border bg-card p-2 text-sm text-text"
      />
    </div>
  );
}

export default function SummaryPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

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

  const handleComplete = async () => {
    await completeSession(sessionId);
    navigate('/today', { replace: true });
  };

  const setsByExercise = new Map<string, LoggedSet[]>();
  (loggedSets ?? []).forEach((s) => {
    const list = setsByExercise.get(s.exerciseId) ?? [];
    list.push(s);
    setsByExercise.set(s.exerciseId, list);
  });

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

      {!editing ? (
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-text">Workout summary</p>
              <p className="mt-0.5 text-xs text-text-secondary">Edit your workout and add notes below.</p>
            </div>
            <button
              onClick={() => setEditing(true)}
              aria-label="Edit workout"
              className="shrink-0 rounded border border-border p-2 text-text-secondary"
            >
              ✎
            </button>
          </div>
          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            {exerciseIds.length > 0 ? (
              exerciseIds.map((exerciseId) => (
                <div key={exerciseId} className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-text">{exerciseById.get(exerciseId)?.name ?? 'Exercise'}</span>
                  <span className="font-mono text-xs font-extralight text-text-secondary">
                    {(setsByExercise.get(exerciseId) ?? []).map(formatSetCompact).join(', ')}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-text-secondary">No sets were logged this workout.</p>
            )}
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          <WorkoutNotesField session={session} />
          {exerciseIds.map((exerciseId) => (
            <ExerciseEditCard
              key={exerciseId}
              exercise={exerciseById.get(exerciseId)}
              sets={setsByExercise.get(exerciseId) ?? []}
              note={session.exerciseNotes[exerciseId] ?? ''}
              onSaveNote={(value) => updateExerciseNote(sessionId, exerciseId, value)}
            />
          ))}
          {exerciseIds.length === 0 && <p className="text-sm text-text-secondary">No sets were logged this workout.</p>}
        </div>
      )}

      <button onClick={handleComplete} className="btn-primary mt-2 w-full py-3.5">
        Complete workout
      </button>
    </div>
  );
}
