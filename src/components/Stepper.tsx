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
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => bump(-step)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold text-slate-600 active:bg-slate-200"
        >
          −
        </button>
        <input
          type="number"
          inputMode="decimal"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="w-14 rounded-lg border border-slate-200 py-2 text-center text-lg font-semibold text-slate-900"
        />
        <button
          type="button"
          onClick={() => bump(step)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold text-slate-600 active:bg-slate-200"
        >
          +
        </button>
      </div>
    </div>
  );
}
