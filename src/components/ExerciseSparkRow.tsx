import { useLiveValue } from '../hooks/useLiveValue';
import { getExerciseTrend } from '../lib/stats';
import Card from './Card';
import Sparkline from './Sparkline';

export default function ExerciseSparkRow({ planId, exerciseId, name }: { planId: string; exerciseId: string; name: string }) {
  const { value: trend } = useLiveValue(() => getExerciseTrend(planId, exerciseId), [planId, exerciseId]);
  const values = (trend ?? []).map((t) => t.topWeight || t.totalReps).filter((v) => v > 0);
  return (
    <Card className="flex items-center justify-between p-3">
      <span className="truncate text-sm text-text">{name}</span>
      <Sparkline values={values} />
    </Card>
  );
}
