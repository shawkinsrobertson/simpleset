import type { ConsistencyDay } from '../lib/stats';

/** GitHub-style consistency grid — `weeks` columns of 7 rows (Sun–Sat). Shrinks cell size instead of scrolling. */
export default function ConsistencyGrid({ weeks, cellSize = 12 }: { weeks: ConsistencyDay[][]; cellSize?: number }) {
  return (
    <div className="grid grid-flow-col gap-1" style={{ gridTemplateRows: `repeat(7, minmax(0, 1fr))` }}>
      {weeks.flat().map((day) => (
        <div
          key={day.date}
          className="rounded-sm"
          style={{
            width: cellSize,
            height: cellSize,
            backgroundColor: day.completed ? 'var(--accent)' : 'var(--border)',
            opacity: day.completed ? 1 : 0.4,
          }}
        />
      ))}
    </div>
  );
}
