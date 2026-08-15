-- The plans this product sells now: free, founder, standard.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- The earlier tiers were priced for a coach that no longer exists. These three
-- match what a study partner is worth: a taste, an early-supporter price that
-- never moves, and the ordinary monthly one.
--
-- The one structural change is `period`. Free is a *total*, not a monthly
-- allowance: 20 minutes to find out whether being asked questions out loud
-- suits you, and no rollover because there is nothing to roll over. Everything
-- else resets each calendar month.

alter table public.plans
  add column if not exists period text not null default 'month'
    check (period in ('month', 'total'));

comment on column public.plans.period is
  'month = the allowance resets on the 1st. total = a lifetime allowance that never resets.';

-- Prices are read from config at display time, not from here, until checkout
-- exists. `price_minor` stays the source of truth for what to charge.
insert into public.plans (
  id, name, monthly_minutes, monthly_sessions, price_minor, currency,
  overage_minor_per_min, seat_minimum, is_public, sort_order, blurb, period
) values
  ('free', 'Gratis', 20, null, 0, 'USD', null, null, true, 10,
   '20 minutos para probar si estudiar hablando te sirve.', 'total'),

  -- Locked price: the point of a founder tier is that it does not move when the
  -- standard one does, so raising `standard` later must not touch this row.
  ('founder', 'Fundador', 300, null, 900, 'USD', null, null, true, 20,
   'Precio fijo para siempre. Para los primeros que se suben.', 'month'),

  ('standard', 'Estándar', 300, null, 1900, 'USD', null, null, true, 30,
   'Estudio diario, con memoria entre sesiones.', 'month')
on conflict (id) do update set
  name             = excluded.name,
  monthly_minutes  = excluded.monthly_minutes,
  monthly_sessions = excluded.monthly_sessions,
  price_minor      = excluded.price_minor,
  currency         = excluded.currency,
  overage_minor_per_min = excluded.overage_minor_per_min,
  seat_minimum     = excluded.seat_minimum,
  is_public        = excluded.is_public,
  sort_order       = excluded.sort_order,
  blurb            = excluded.blurb,
  period           = excluded.period;

-- The retired tiers stop being offered. Not deleted: profiles still reference
-- them by foreign key, and a learner mid-month should keep what they paid for.
update public.plans set is_public = false
  where id in ('esencial', 'profesional', 'intensivo', 'equipo', 'empresa');

-- ------------------------------------------------------ lifetime usage ------
-- `plan_usage` counts the current calendar month, which is the wrong window for
-- a total allowance: a free learner would get 20 fresh minutes every month.
-- This view answers the other question, and the gate picks by `period`.
create or replace view public.plan_usage_total as
select
  p.id                                       as user_id,
  p.plan_id,
  pl.monthly_minutes,
  pl.period,
  coalesce(sum(s.duration_seconds), 0) / 60.0 as minutes,
  count(s.id)                                 as sessions
from public.profiles p
join public.plans pl on pl.id = p.plan_id
left join public.coach_sessions s on s.user_id = p.id
group by p.id, p.plan_id, pl.monthly_minutes, pl.period;

alter view public.plan_usage_total set (security_invoker = on);
grant select on public.plan_usage_total to authenticated;
