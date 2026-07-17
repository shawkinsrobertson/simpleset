interface StepperProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step?: number;
  min?: number;
}

export default function Stepper({ label, value, onChange, step = 1, min = 0 }: StepperProps) {
  const bump = (delta: number) => {
    const base = value ?? 0;
    const next = Math.max(min, Math.round((base + delta) * 100) / 100);
    onChange(next);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => bump(-step)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-bg text-lg font-semibold text-text-secondary active:bg-border"
        >
          −
        </button>
        <input
          type="number"
          inputMode="decimal"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="w-14 rounded border border-border py-2 text-center text-lg font-semibold text-text"
        />
        <button
          type="button"
          onClick={() => bump(step)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-bg text-lg font-semibold text-text-secondary active:bg-border"
        >
          +
        </button>
      </div>
    </div>
  );
}
