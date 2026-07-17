import { useState } from 'react';
import clsx from 'clsx';
import { useActivePlan } from '../hooks/useActivePlan';
import { useLiveValue } from '../hooks/useLiveValue';
import {
  getAvgSessionsPerWeek,
  getConsistencyGrid,
  getExercisesWithHistory,
  getPersonalRecords,
  getVolumeOverTime,
  weeksForRange,
  type StatsRange,
} from '../lib/stats';
import Card from '../components/Card';
import ConsistencyGrid from '../components/ConsistencyGrid';
import ExerciseSparkRow from '../components/ExerciseSparkRow';

const RANGES: { value: StatsRange; label: string }[] = [
  { value: '1m', label: '1 month' },
  { value: '3m', label: '3 months' },
  { value: '6m', label: '6 months' },
  { value: 'all', label: 'All time' },
];

/** Grid width available inside the mobile-width shell, minus card padding — used to shrink cells instead of scrolling. */
const GRID_WIDTH_PX = 330;

export default function DetailedStatsPage() {
  const { loading: planLoading, plan } = useActivePlan();
  const [range, setRange] = useState<StatsRange>('3m');

  const weeks = plan ? weeksForRange(range, plan.importDate) : 0;

  const { value: grid } = useLiveValue(
    () => (plan ? getConsistencyGrid(plan.id, weeks) : Promise.resolve([])),
    [plan?.id, weeks],
  );
  const { value: prs } = useLiveValue(() => (plan ? getPersonalRecords(plan.id) : Promise.resolve([])), [plan?.id]);
  const { value: volume } = useLiveValue(() => (plan ? getVolumeOverTime(plan.id) : Promise.resolve([])), [plan?.id]);
  const { value: avgPerWeek } = useLiveValue(
    () => (plan ? getAvgSessionsPerWeek(plan.id) : Promise.resolve(null)),
    [plan?.id],
  );
  const { value: exercisesWithHistory } = useLiveValue(
    () => (plan ? getExercisesWithHistory(plan.id) : Promise.resolve([])),
    [plan?.id],
  );

  if (planLoading) return null;
  if (!plan) return null;

  const totalVolume = (volume ?? []).reduce((sum, v) => sum + v.volume, 0);
  const cellSize = Math.max(3, Math.floor(GRID_WIDTH_PX / weeks) - 4);

  return (
    <div className="flex flex-col gap-5 px-5 pt-8">
      <h1 className="font-display text-2xl font-semibold text-text">Detailed stats</h1>

      <section>
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={clsx(
                'flex-1 rounded border py-1.5 text-xs font-medium',
                range === r.value ? 'border-accent bg-accent text-accent-ink' : 'border-border text-text-secondary',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <Card className="mt-2 overflow-hidden p-3">
          {grid && grid.length > 0 && <ConsistencyGrid weeks={grid} cellSize={cellSize} />}
        </Card>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <Card className="p-3 text-center">
          <p className="font-mono text-lg font-semibold text-text">{Math.round(totalVolume).toLocaleString()}</p>
          <p className="text-[10px] uppercase tracking-wide text-text-secondary">Total volume</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="font-mono text-lg font-semibold text-text">{avgPerWeek ?? '—'}</p>
          <p className="text-[10px] uppercase tracking-wide text-text-secondary">Avg sessions/week</p>
        </Card>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Personal records</h2>
        {prs && prs.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {prs.map((pr) => (
              <Card key={pr.exerciseId} className="flex items-center justify-between p-3">
                <span className="text-sm text-text">{pr.exerciseName}</span>
                <span className="font-mono text-sm font-semibold text-text">{pr.display}</span>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">No PRs logged yet.</p>
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
    </div>
  );
}
