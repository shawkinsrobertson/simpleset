export type BoxState = 'done' | 'active' | 'todo';

interface StatusBoxProps {
  state: BoxState;
  size?: number;
}

/** Squared indicator box used for the Day view checklist row and Logging screen set rows. */
export default function StatusBox({ state, size = 28 }: StatusBoxProps) {
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: 'var(--radius)',
        borderWidth: 'var(--border-width)',
        borderStyle: 'solid',
        borderColor: state === 'todo' ? 'var(--border)' : 'var(--accent)',
        backgroundColor: state === 'done' ? 'var(--accent)' : 'transparent',
      }}
    >
      {state === 'done' && (
        <svg
          viewBox="0 0 16 16"
          width={size * 0.55}
          height={size * 0.55}
          fill="none"
          stroke="var(--accent-ink)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 8.5l3 3 7-7" />
        </svg>
      )}
    </div>
  );
}
