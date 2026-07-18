import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useActivePlan } from '../hooks/useActivePlan';
import { useLiveValue } from '../hooks/useLiveValue';
import { getConsistencyGrid, getCycleProgress, getExercisesWithHistory, getPersonalRecords, getStreak } from '../lib/stats';
import Card from '../components/Card';
import ExerciseSparkRow from '../components/ExerciseSparkRow';
import ConsistencyGrid from '../components/ConsistencyGrid';

function PrCard({ prs }: { prs: Awaited<ReturnType<typeof getPersonalRecords>> }) {
  const [index, setIndex] = useState(0);
  if (prs.length === 0) {
    return (
      <Card className="p-3 text-center">
        <p className="text-sm text-text-secondary">No PRs yet</p>
      </Card>
    );
  }
  const pr = prs[index % prs.length];
  return (
    <Card className="p-3 text-center" as="button" onClick={() => setIndex((i) => i + 1)}>
      <p className="truncate text-[11px] font-medium text-text-secondary">{pr.exerciseName}</p>
      <p className="font-mono text-lg font-extralight text-text">{pr.display}</p>
      {prs.length > 1 && (
        <div className="mt-1 flex justify-center gap-1">
          {prs.map((_, i) => (
            <span
              key={i}
              className="h-1.5 w-1.5"
              style={{ backgroundColor: i === index % prs.length ? 'var(--accent)' : 'var(--border)' }}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

export default function StatsPage() {
  const { loading: planLoading, plan } = useActivePlan();

  const { value: streak } = useLiveValue(() => (plan ? getStreak(plan.id) : Promise.resolve(0)), [plan?.id]);
  const { value: cycle } = useLiveValue(
    () => (plan ? getCycleProgress(plan.id) : Promise.resolve({ completed: 0, total: 0 })),
    [plan?.id],
  );
  const { value: prs } = useLiveValue(() => (plan ? getPersonalRecords(plan.id) : Promise.resolve([])), [plan?.id]);
  const { value: grid } = useLiveValue(() => (plan ? getConsistencyGrid(plan.id, 8) : Promise.resolve([])), [plan?.id]);
  const { value: exercisesWithHistory } = useLiveValue(
    () => (plan ? getExercisesWithHistory(plan.id) : Promise.resolve([])),
    [plan?.id],
  );

  if (planLoading) return null;

  if (!plan) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 pt-20 text-center">
        <h1 className="text-xl font-semibold text-text">No stats yet</h1>
        <Link to="/import" className="btn-primary mt-2 px-5 py-3">
          Import a plan
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 px-5 pt-8">
      <h1 className="font-display text-2xl font-semibold text-text">Stats</h1>

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3 text-center">
          <p className="font-mono text-xl font-extralight text-text">🔥{streak ?? 0}</p>
          <p className="text-[10px] uppercase tracking-wide text-text-secondary">Streak</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="font-mono text-xl font-extralight text-text">
            {cycle?.completed ?? 0}/{cycle?.total ?? 0}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-text-secondary">Sessions completed</p>
        </Card>
        {prs && <PrCard prs={prs} />}
      </div>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Consistency</h2>
        {grid && grid.some((w) => w.some((d) => d.completed)) ? (
          <Card className="p-3">
            <ConsistencyGrid weeks={grid} />
          </Card>
        ) : (
          <p className="text-sm text-text-secondary">Complete a workout to start building your streak.</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Exercises</h2>
        {exercisesWithHistory && exercisesWithHistory.length > 0 ? (
          <div className="flex flex-col gap-2">
            {exercisesWithHistory.map((ex) => (
              <ExerciseSparkRow key={ex.id} planId={plan.id} exerciseId={ex.id} name={ex.name} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">Log a few sessions to see per-exercise trends.</p>
        )}
      </section>

      <Link to="/stats/detailed" className="btn-secondary block py-3 text-sm">
        View detailed stats
      </Link>
    </div>
  );
}
