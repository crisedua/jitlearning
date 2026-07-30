-- Accounts, plans, and the usage ledger.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- Identity itself lives in `auth.users`, which Supabase owns. Everything here
-- hangs off it. Nothing in this file enforces a limit yet — the plan columns
-- exist so that decision can be made from real data instead of a guess.

-- ---------------------------------------------------------------- plans -----
-- A tiny catalogue rather than an enum: adding a tier should be an insert, not
-- a migration, and the limits have to be readable from the app.
create table if not exists public.plans (
  id                text primary key,          -- 'free', 'pro', …
  name              text not null,             -- shown to the learner
  monthly_minutes   integer,                   -- null = unlimited
  monthly_sessions  integer,                   -- null = unlimited
  created_at        timestamptz not null default now()
);

insert into public.plans (id, name, monthly_minutes, monthly_sessions)
values ('free', 'Gratis', null, null)
on conflict (id) do nothing;

-- ------------------------------------------------------------- profiles -----
-- One row per user, created by the trigger below on sign-up. The primary key
-- *is* the auth user id, so there is no second identity to keep in sync, and
-- `on delete cascade` means deleting the user really deletes their data.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  plan_id     text not null default 'free' references public.plans (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -------------------------------------------------------- coach_sessions ----
-- The usage ledger: one row per signed URL minted, which is one row per
-- billable conversation the app has handed out.
--
-- `duration_seconds` and `message_count` first arrive self-reported from the
-- browser and are then overwritten by `npm run sync:usage` with ElevenLabs'
-- own numbers. `usage_synced_at` is how you tell the two apart: a row that has
-- never been synced is an estimate, not a receipt.
create table if not exists public.coach_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  agent_id         text not null,
  conversation_id  text unique,               -- ElevenLabs' id; null until connected
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  duration_seconds integer,
  message_count    integer,
  credits          numeric,                   -- ElevenLabs credits, once known
  usage_synced_at  timestamptz
);

-- The two queries this table exists to answer: "what has this user used this
-- month" and "which rows still need reconciling".
create index if not exists coach_sessions_user_started_idx
  on public.coach_sessions (user_id, started_at desc);
create index if not exists coach_sessions_unsynced_idx
  on public.coach_sessions (usage_synced_at) where usage_synced_at is null;

-- ------------------------------------------------ profile on sign-up --------
-- `security definer` because the trigger runs as the signing-up user, who has
-- no rights on public.profiles. The empty search_path is not decoration: it
-- stops a table planted on another schema from being resolved instead.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------------------------------------------------------------- rls ---------
-- Enabled on every table. With RLS on and no permissive policy, a table is
-- closed by default — the policies below open exactly one door each, and only
-- onto the caller's own rows.
--
-- The app's writes (profile upserts, usage rows) go through the service role,
-- which bypasses RLS entirely. That is deliberate: minutes used must not be
-- writable by the browser that reports them.
alter table public.plans          enable row level security;
alter table public.profiles       enable row level security;
alter table public.coach_sessions enable row level security;

drop policy if exists "plans are readable by signed-in users" on public.plans;
create policy "plans are readable by signed-in users"
  on public.plans for select
  to authenticated
  using (true);

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

-- Deliberately no insert/update policy on profiles: name and avatar come from
-- Google, and plan_id is a billing decision. Both are the server's to write.

drop policy if exists "read own sessions" on public.coach_sessions;
create policy "read own sessions"
  on public.coach_sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);
