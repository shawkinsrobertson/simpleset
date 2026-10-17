-- Daily usage table backing the AI-assisted PDF import rate limit.
-- Replaces the old server/'s in-memory Map — durable across Edge Function
-- cold starts/instances, and the RPC below makes the check-and-increment
-- atomic (no race between concurrent requests from the same user).
create table public.parse_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  count integer not null default 0,
  primary key (user_id, day)
);

alter table public.parse_usage enable row level security;

-- Only the "parse" Edge Function (via its service-role key, which bypasses
-- RLS entirely) touches this table — no client-side access at all.
create policy "no direct client access" on public.parse_usage
  for all
  using (false);

-- Atomically increments today's count for p_user_id and reports whether
-- they're still under p_limit. INSERT ... ON CONFLICT ... RETURNING is a
-- single statement, so concurrent calls for the same user can't race past
-- each other the way a naive "read count, then write count + 1" would.
create or replace function public.increment_parse_usage(p_user_id uuid, p_limit integer)
returns table (allowed boolean, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.parse_usage (user_id, day, count)
  values (p_user_id, current_date, 1)
  on conflict (user_id, day) do update set count = parse_usage.count + 1
  returning count into v_count;

  if v_count > p_limit then
    return query select false, 0;
  else
    return query select true, p_limit - v_count;
  end if;
end;
$$;
