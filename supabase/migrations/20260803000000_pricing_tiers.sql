-- Pricing: what a plan costs, and what it buys.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- `init_accounts` created the plans catalogue with the two limits that matter
-- (minutes and sessions) and deliberately left price out, because there was no
-- usage data yet to price against. This adds the commercial half.
--
-- The unit is the minute, not the session or the message. That is not a
-- product decision, it is an accounting one: a spoken minute costs money on two
-- meters at once — ElevenLabs bills the voice, and the LLM behind it is billed
-- separately per token — and both scale with talk time and nothing else. A
-- plan priced per session would charge the same for a two-minute question and
-- a forty-minute one.
--
-- Prices are stored in the currency's smallest unit so nothing here is ever a
-- float. `currency` is per row rather than global, so a CLP price list can be
-- added alongside without a schema change.

-- ---------------------------------------------------------------- plans -----
alter table public.plans
  -- 0 for the free tier. Smallest unit: cents for USD, whole pesos for CLP.
  add column if not exists price_minor            integer not null default 0,
  add column if not exists currency               text    not null default 'USD',
  -- What a minute costs past `monthly_minutes`. NULL means there is no overage:
  -- the plan stops at its allowance. That is the honest default for a free
  -- tier, where an unattended loop must never be able to spend money.
  add column if not exists overage_minor_per_min  integer,
  -- Per-seat plans only: the smallest number of seats that can be bought.
  -- NULL marks an individual plan.
  add column if not exists seat_minimum           integer,
  -- Whether the plan can be bought without talking to anyone. Team and legacy
  -- tiers are still shown on the pricing page; they just route to a person
  -- instead of a checkout.
  add column if not exists is_public              boolean not null default true,
  add column if not exists sort_order             integer not null default 0,
  -- One line for the pricing card. Kept next to the numbers so the two cannot
  -- drift apart in a way nobody notices.
  add column if not exists blurb                  text;

comment on column public.plans.monthly_minutes is
  'Spoken minutes included per calendar month. NULL = unlimited (do not combine with a NULL overage price).';
comment on column public.plans.overage_minor_per_min is
  'Price of a minute past the allowance, in the currency''s smallest unit. NULL = hard stop, no overage billed.';

-- The free tier arrived unlimited, which was the right placeholder when there
-- was nothing to meter and is the wrong thing to ship. 20 minutes is roughly
-- two real sessions — enough to judge whether the coach knows your subject,
-- not enough to be someone's whole answer. The session cap is separate on
-- purpose: it stops twenty one-minute connections from burning the allowance
-- on setup latency alone.
update public.plans set
  monthly_minutes  = 20,
  monthly_sessions = 3,
  price_minor      = 0,
  currency         = 'USD',
  -- No overage. A free account must not be able to generate a bill.
  overage_minor_per_min = null,
  sort_order       = 10,
  blurb            = 'Para probar si el coach sabe de lo tuyo.'
where id = 'free';

-- Paid tiers.
--
-- Each allowance is priced so the plan still earns money if the learner uses
-- every included minute — see `docs/pricing.md` for the cost per minute this
-- comes from. Overage is priced well above cost rather than at cost: it is
-- meant to be a warning that the plan is the wrong size, not a revenue line.
insert into public.plans (
  id, name, monthly_minutes, monthly_sessions,
  price_minor, currency, overage_minor_per_min, seat_minimum,
  is_public, sort_order, blurb
) values
  ('esencial', 'Esencial', 60, null,
   1900, 'USD', 35, null,
   true, 20, 'Una consulta por semana, con margen.'),

  ('profesional', 'Profesional', 180, null,
   4900, 'USD', 35, null,
   true, 30, 'Para quien vuelve varias veces por semana.'),

  ('intensivo', 'Intensivo', 400, null,
   9900, 'USD', 30, null,
   true, 40, 'Uso diario, o un proyecto con fecha.'),

  -- Per seat. Sold to an organisation, so it is not self-serve and does not
  -- appear on the public page.
  ('equipo', 'Equipo', 120, null,
   3500, 'USD', 30, 10,
   false, 50, 'Por persona, desde 10 personas.')
on conflict (id) do update set
  name                  = excluded.name,
  monthly_minutes       = excluded.monthly_minutes,
  monthly_sessions      = excluded.monthly_sessions,
  price_minor           = excluded.price_minor,
  currency              = excluded.currency,
  overage_minor_per_min = excluded.overage_minor_per_min,
  seat_minimum          = excluded.seat_minimum,
  is_public             = excluded.is_public,
  sort_order            = excluded.sort_order,
  blurb                 = excluded.blurb;

-- A zero-minute allowance is not a cheap plan, it is a plan nobody can use --
-- every session would be refused at connection time. NULL still means
-- unlimited; only 0 and negatives are rejected.
alter table public.plans
  drop constraint if exists plans_allowance_is_coherent;
alter table public.plans
  add constraint plans_allowance_is_coherent
  check (monthly_minutes is null or monthly_minutes > 0);

-- `init_accounts` let signed-in users read the catalogue, which was right when
-- the only reader was the app. The pricing page is public and visitors are
-- anonymous, so without this it renders to an empty list — and an RLS filter
-- returns zero rows with *no error*, so the page would quietly fall back to its
-- compiled copy of the prices and nobody would notice until one changed.
--
-- Nothing here is confidential: a price list is published on purpose. The read
-- is unconditional rather than `using (is_public)` because the page shows the
-- team tier too — `is_public` decides whether a plan can be bought without
-- talking to anyone, not whether its price may be seen.
drop policy if exists "plans are readable by anyone" on public.plans;
create policy "plans are readable by anyone"
  on public.plans for select
  to anon, authenticated
  using (true);

-- ------------------------------------------------------ current usage -------
-- What a learner has spent this calendar month, ready to compare against their
-- plan. Enforcement still has to be written; this is the number it will read.
--
-- Two things it deliberately does not hide:
--
--   `synced_minutes` counts only rows that `sync:usage` has reconciled against
--   ElevenLabs. `minutes` counts everything, including the browser's own
--   self-report. Bill on the first, show the learner the second — a session
--   that ended twenty seconds ago is real to them and not yet reconciled.
--
--   A session still in progress has no `duration_seconds`, so it contributes
--   nothing until it ends. A cap checked mid-session is checked against the
--   state before that session started.
create or replace view public.plan_usage as
select
  p.id                                as user_id,
  p.plan_id,
  pl.monthly_minutes,
  pl.monthly_sessions,
  date_trunc('month', now())          as period_start,
  coalesce(sum(s.duration_seconds), 0) / 60.0                          as minutes,
  coalesce(sum(s.duration_seconds) filter (where s.usage_synced_at is not null), 0) / 60.0
                                                                       as synced_minutes,
  count(s.id)                         as sessions
from public.profiles p
join public.plans pl on pl.id = p.plan_id
left join public.coach_sessions s
  on s.user_id = p.id
 and s.started_at >= date_trunc('month', now())
group by p.id, p.plan_id, pl.monthly_minutes, pl.monthly_sessions;

-- The view runs as its caller, so a learner selecting from it sees only the
-- rows `coach_sessions`' own row-level security already lets them see. Without
-- this it would run as the definer and hand every learner everyone else's
-- usage.
alter view public.plan_usage set (security_invoker = on);

grant select on public.plan_usage to authenticated;
