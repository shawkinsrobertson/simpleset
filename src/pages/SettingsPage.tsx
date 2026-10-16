import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { useTheme } from '../hooks/useTheme';
import type { ColorMode } from '../lib/theme';
import { useAuth } from '../hooks/useAuth';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const MODES: { value: ColorMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export default function SettingsPage() {
  const { mode, contrast, setMode, setContrast } = useTheme();
  const { loading: authLoading, user } = useAuth();

  return (
    <div className="flex flex-col gap-6 px-5 pt-8">
      <h1 className="font-display text-2xl font-semibold text-text">Settings</h1>

      {isSupabaseConfigured() && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Account</h2>
          <div className="border border-border bg-card p-4">
            {authLoading ? null : user ? (
              <>
                <p className="text-sm font-medium text-text">{user.email}</p>
                <p className="mt-0.5 text-xs text-text-secondary">Used for AI-assisted PDF import.</p>
                <button onClick={() => supabase?.auth.signOut()} className="btn-secondary mt-3 w-full py-2 text-sm">
                  Sign out
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-text">Not signed in</p>
                <p className="mt-0.5 text-xs text-text-secondary">
                  An account is only needed for AI-assisted PDF import — everything else works without one.
                </p>
                <Link to="/auth" className="btn-primary mt-3 block w-full py-2 text-center text-sm">
                  Sign in
                </Link>
              </>
            )}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Display</h2>

        <div className="border border-border bg-card p-4">
          <p className="text-sm font-medium text-text">Color mode</p>
          <div className="mt-2 flex gap-2">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={clsx(
                  'flex-1 py-2 text-sm',
                  mode === m.value ? 'btn-primary' : 'btn-secondary',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setContrast(contrast === 'high' ? 'soft' : 'high')}
          className="flex items-center justify-between border border-border bg-card p-4 text-left w-full"
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
