import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type Mode = 'signin' | 'signup';

export default function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/import';

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfirmed, setNotConfirmed] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  if (!supabase) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 pt-20 text-center">
        <h1 className="text-xl font-semibold text-text">Accounts aren't set up yet</h1>
        <p className="text-sm text-text-secondary">
          This deployment doesn't have Supabase configured, so AI-assisted PDF import isn't available.
          Everything else — tracking, stats, docx/xlsx/text import, manual entry — works without an account.
        </p>
        <button onClick={() => navigate('/import')} className="btn-primary mt-2 px-5 py-3">
          Back to import
        </button>
      </div>
    );
  }

  const resendConfirmation = async () => {
    if (!supabase) return;
    setResendStatus('sending');
    const { error: resendError } = await supabase.auth.resend({ type: 'signup', email });
    setResendStatus(resendError ? 'idle' : 'sent');
    if (resendError) setError(resendError.message);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setError(null);
    setNotConfirmed(false);

    if (mode === 'signup') {
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords don’t match.');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}${returnTo}` },
        });
        if (signUpError) {
          setError(signUpError.message);
          return;
        }
        setAwaitingConfirmation(true);
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          if (signInError.message.toLowerCase().includes('email not confirmed')) {
            setNotConfirmed(true);
          } else {
            setError(signInError.message);
          }
          return;
        }
        navigate(returnTo);
      }
    } finally {
      setLoading(false);
    }
  };

  if (awaitingConfirmation) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 pt-20 text-center">
        <h1 className="text-xl font-semibold text-text">Check your email</h1>
        <p className="text-sm text-text-secondary">
          We sent a confirmation link to <span className="font-medium text-text">{email}</span>. Click it to
          finish creating your account — you'll land right back here.
        </p>
        <button onClick={() => navigate('/import')} className="btn-secondary mt-2 px-5 py-3">
          Back to import
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-5 pt-10">
      <div>
        <h1 className="font-display text-2xl font-semibold text-text">
          {mode === 'signin' ? 'Sign in' : 'Create an account'}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          AI-assisted PDF import is a paid feature and needs an account to keep usage fair. Everything else in
          simpleSet works without one.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm text-text">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-border px-3 py-2.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-text">
          Password
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-border px-3 py-2.5"
          />
        </label>
        {mode === 'signup' && (
          <label className="flex flex-col gap-1 text-sm text-text">
            Confirm password
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="rounded border border-border px-3 py-2.5"
            />
          </label>
        )}

        {error && <div className="rounded bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {notConfirmed && (
          <div className="rounded bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
            <p>That account hasn't confirmed its email yet.</p>
            <button
              type="button"
              onClick={resendConfirmation}
              disabled={resendStatus !== 'idle'}
              className="mt-2 font-medium text-accent disabled:opacity-50"
            >
              {resendStatus === 'sent' ? 'Confirmation email sent' : resendStatus === 'sending' ? 'Sending…' : 'Resend confirmation email'}
            </button>
          </div>
        )}

        <button disabled={loading} type="submit" className="btn-primary mt-1 py-3.5 disabled:opacity-50">
          {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <button
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin');
          setError(null);
          setNotConfirmed(false);
        }}
        className="text-center text-sm text-accent"
      >
        {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
      </button>
    </div>
  );
}
