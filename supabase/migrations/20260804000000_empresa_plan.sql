-- The Empresa tier: an organisation's own coach, on its own domain, trained on
-- its own material.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- Two things distinguish it from Equipo, and both cost money before anyone
-- speaks a minute: a dedicated stack (own ElevenLabs workspace so the corpus
-- is private, own Supabase project so the data is), and the work of building
-- the corpus and tuning the coach to it. The first is why the seat price is
-- above Equipo's; the second is why there is a setup fee at all. The
-- arithmetic is in docs/pricing.md §3.

-- One-time implementation price. NULL for every plan that has none. Kept in
-- the table for the same reason price_minor is: a fee quoted on the pricing
-- page and a fee charged should not be able to drift apart.
alter table public.plans
  add column if not exists setup_minor integer;

comment on column public.plans.setup_minor is
  'One-time implementation fee in the currency''s smallest unit. NULL = no setup fee.';

insert into public.plans (
  id, name, monthly_minutes, monthly_sessions,
  price_minor, currency, overage_minor_per_min, seat_minimum,
  is_public, sort_order, blurb, setup_minor
) values
  ('empresa', 'Empresa', 120, null,
   4500, 'USD', 30, 20,
   false, 60, 'Su propio coach, con su material, en su dominio.', 150000)
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
  blurb                 = excluded.blurb,
  setup_minor           = excluded.setup_minor;
