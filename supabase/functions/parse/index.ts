// Supabase Edge Function backing AI-assisted PDF import. Replaces the old
// server/'s Express app — same /parse contract (text/fileBase64/mimeType/
// fallbackName in, ParsedPlan or an error out), but the rate limiter now
// lives in Postgres (see supabase/migrations/*_parse_usage.sql) instead of
// an in-memory Map, and identity comes from the caller's Supabase session
// JWT instead of a client-generated device id.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parsePlanWithAI } from './claude.ts';

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*';
const FREE_PARSES_PER_DAY = Number(Deno.env.get('FREE_PARSES_PER_DAY')) || 10;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!ANTHROPIC_API_KEY) {
    return json({ error: 'AI parsing is not configured on this deployment.' }, 503);
  }

  // Identify the caller from their session JWT — createClient with the
  // request's own Authorization header makes getUser() validate it.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Sign in to use AI-assisted PDF import.' }, 401);
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return json({ error: 'Sign in to use AI-assisted PDF import.' }, 401);
  }

  const { text, fileBase64, mimeType, fallbackName } = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof fallbackName !== 'string' || (!text && !fileBase64)) {
    return json({ error: 'Request must include fallbackName and either text or fileBase64.' }, 400);
  }

  // Service-role client for the rate-limit RPC — parse_usage denies all
  // direct client access, so this needs to bypass RLS.
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: rpcData, error: rpcError } = await adminClient
    .rpc('increment_parse_usage', { p_user_id: userData.user.id, p_limit: FREE_PARSES_PER_DAY })
    .single();
  if (rpcError) {
    console.error('increment_parse_usage failed:', rpcError);
    return json({ error: 'Rate-limit check failed.' }, 502);
  }
  const { allowed } = rpcData as { allowed: boolean; remaining: number };
  if (!allowed) {
    return json({ error: 'Daily AI-parsing limit reached. Try again tomorrow.' }, 429);
  }

  try {
    const plan = await parsePlanWithAI(
      { text: text as string | undefined, fileBase64: fileBase64 as string | undefined, mimeType: mimeType as string | undefined, fallbackName },
      ANTHROPIC_API_KEY,
    );
    return json(plan, 200);
  } catch (err) {
    console.error('parsePlanWithAI failed:', err);
    return json({ error: 'AI parsing failed.' }, 502);
  }
});
