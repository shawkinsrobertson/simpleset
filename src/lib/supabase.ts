import { createClient } from '@supabase/supabase-js';
import type { NavigateFunction } from 'react-router-dom';

function getSupabaseUrl(): string | undefined {
  return import.meta.env.VITE_SUPABASE_URL as string | undefined;
}

function getSupabaseAnonKey(): string | undefined {
  return import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

/** AI-assisted PDF import's backend. Undefined when Supabase isn't configured for this deployment. */
export const supabase = isSupabaseConfigured() ? createClient(getSupabaseUrl()!, getSupabaseAnonKey()!) : undefined;

/**
 * Hard gate for the three PDF-AI entry points: if there's no signed-in
 * session, send the user to sign in/up instead of attempting the call.
 * Returns whether the caller is clear to proceed.
 */
export async function requireSession(navigate: NavigateFunction, returnTo: string): Promise<boolean> {
  if (!supabase) {
    navigate(`/auth?returnTo=${encodeURIComponent(returnTo)}`);
    return false;
  }
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    navigate(`/auth?returnTo=${encodeURIComponent(returnTo)}`);
    return false;
  }
  return true;
}
