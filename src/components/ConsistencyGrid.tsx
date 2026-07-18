import type { ConsistencyDay } from '../lib/stats';

/** GitHub-style consistency grid — one row per week (7 columns, Sun–Sat), most recent week last. */
export default function ConsistencyGrid({ weeks, cellSize = 32 }: { weeks: ConsistencyDay[][]; cellSize?: number }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(7, ${cellSize}px)` }}>
      {weeks.flat().map((day) => (
        <div
          key={day.date}
          style={{
            width: cellSize,
            height: cellSize,
            backgroundColor: day.completed ? 'var(--accent)' : 'var(--border)',
          }}
        />
      ))}
    </div>
  );
}
