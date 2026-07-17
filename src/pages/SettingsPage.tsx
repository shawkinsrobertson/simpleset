import clsx from 'clsx';
import { useTheme } from '../hooks/useTheme';
import type { ColorMode } from '../lib/theme';

const MODES: { value: ColorMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export default function SettingsPage() {
  const { mode, contrast, setMode, setContrast } = useTheme();

  return (
    <div className="flex flex-col gap-6 px-5 pt-8">
      <h1 className="font-display text-2xl font-semibold text-text">Settings</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Display</h2>

        <div className="rounded border border-border bg-card p-4">
          <p className="text-sm font-medium text-text">Color mode</p>
          <div className="mt-2 flex gap-2">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={clsx(
                  'flex-1 rounded border py-2 text-sm font-medium',
                  mode === m.value ? 'border-accent bg-accent text-accent-ink' : 'border-border bg-transparent text-text-secondary',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setContrast(contrast === 'high' ? 'soft' : 'high')}
          className="flex items-center justify-between rounded border border-border bg-card p-4 text-left"
        >
          <div>
            <p className="text-sm font-medium text-text">Increase contrast</p>
            <p className="mt-0.5 text-xs text-text-secondary">Thicker borders, higher-contrast backgrounds.</p>
          </div>
          <span
            aria-hidden
            className="relative h-6 w-10 shrink-0 rounded-full"
            style={{ backgroundColor: contrast === 'high' ? 'var(--accent)' : 'var(--border)' }}
          >
            <span
              className="absolute top-0.5 h-5 w-5 rounded-full bg-card transition-[left]"
              style={{ left: contrast === 'high' ? '18px' : '2px' }}
            />
          </span>
        </button>
      </section>
    </div>
  );
}
