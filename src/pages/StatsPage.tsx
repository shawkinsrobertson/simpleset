import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useActivePlan } from '../hooks/useActivePlan';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getAdherence, getExerciseTrend, getExercisesWithHistory, getVolumeOverTime } from '../lib/stats';
import type { AdherenceStats, ExerciseTrendPoint, VolumePoint } from '../lib/stats';
import type { Exercise } from '../db/types';

const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

export default function StatsPage() {
  const { loading: planLoading, plan } = useActivePlan();
  const [volume, setVolume] = useState<VolumePoint[]>([]);
  const [adherence, setAdherence] = useState<AdherenceStats | null>(null);
  const [exercisesWithHistory, setExercisesWithHistory] = useState<Exercise[]>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('');
  const [trend, setTrend] = useState<ExerciseTrendPoint[]>([]);

  useEffect(() => {
    if (!plan) return;
    getVolumeOverTime(plan.id).then(setVolume);
    getAdherence(plan.id).then(setAdherence);
    getExercisesWithHistory(plan.id).then((exs) => {
      setExercisesWithHistory(exs);
      setSelectedExerciseId((prev) => prev || exs[0]?.id || '');
    });
  }, [plan]);

  useEffect(() => {
    if (!plan || !selectedExerciseId) {
      setTrend([]);
      return;
    }
    getExerciseTrend(plan.id, selectedExerciseId).then(setTrend);
  }, [plan, selectedExerciseId]);

  const volumeData = useMemo(
    () => volume.map((v) => ({ date: dateFmt.format(v.date), volume: Math.round(v.volume) })),
    [volume],
  );
  const trendData = useMemo(
    () => trend.map((t) => ({ date: dateFmt.format(t.date), weight: t.topWeight, reps: t.totalReps })),
    [trend],
  );

  if (planLoading) return null;

  if (!plan) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 pt-20 text-center">
        <span className="text-4xl">📈</span>
        <h1 className="text-xl font-semibold text-slate-900">No stats yet</h1>
        <Link to="/import" className="mt-2 rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white">
          Import a plan
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-5 pt-8">
      <h1 className="text-2xl font-semibold text-slate-900">Stats</h1>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-800">Adherence</h2>
        {adherence && adherence.total > 0 ? (
          <div className="mt-2 flex items-center gap-4">
            <span className="text-3xl font-bold text-brand-600">{adherence.percent}%</span>
            <p className="text-sm text-slate-500">
              {adherence.completed} completed, {adherence.skipped} skipped ({adherence.total} sessions)
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-400">Finish or skip a workout to see adherence.</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-800">Volume over time</h2>
        {volumeData.length > 0 ? (
          <div className="mt-3 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumeData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={40} />
                <Tooltip />
                <Bar dataKey="volume" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-400">Complete a workout to see your volume trend.</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Per-exercise progress</h2>
          {exercisesWithHistory.length > 0 && (
            <select
              value={selectedExerciseId}
              onChange={(e) => setSelectedExerciseId(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
            >
              {exercisesWithHistory.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {trendData.length > 0 ? (
          <div className="mt-3 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={40} />
                <Tooltip />
                <Line type="monotone" dataKey="weight" stroke="#0d9488" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-400">
            Log a few sessions to see weight/reps trends per exercise.
          </p>
        )}
      </section>
    </div>
  );
}
