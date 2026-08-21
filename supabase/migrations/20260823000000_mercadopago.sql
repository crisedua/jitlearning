-- Taking money in Chile, where Stripe is not what people pay with.
--
-- The plans are priced in USD and sold through Stripe Checkout, which works and
-- which almost nobody in this product's market uses. Mercado Pago is the local
-- rail: card, debit, or the balance somebody already keeps in the app.
--
-- Added beside Stripe rather than replacing it. Both write the same column —
-- `profiles.plan_id`, the one thing the gate reads — so a learner who paid
-- through either is a learner with a plan, and neither provider needs to know
-- the other exists.

-- The Mercado Pago subscription this profile is paying through.
--
-- The Stripe equivalent needs two columns because Stripe puts a customer
-- between a person and their subscription. Mercado Pago carries an
-- `external_reference` on the subscription itself, which this app sets to the
-- learner's id, so the webhook can find the profile without a mapping table and
-- this column exists only so the notebook can show and cancel what somebody has.
alter table public.profiles add column if not exists mp_preapproval_id text;

create index if not exists profiles_mp_preapproval_idx
  on public.profiles (mp_preapproval_id)
  where mp_preapproval_id is not null;

-- What this plan costs in Chilean pesos.
--
-- Separate from `price_minor` rather than converted at runtime. A rate applied
-- in code makes the price move on its own between the page somebody read and
-- the charge they authorised, and "9 dólares" converted at today's rate is a
-- number nobody chose: 8.990 is a price, 8.743 is an exchange rate.
--
-- CLP has no minor unit, so this is whole pesos.
--
-- Null means the plan is not sold through Mercado Pago yet, and the checkout
-- route refuses it rather than inventing an amount. That is the state every
-- plan is in the moment this migration runs.
alter table public.plans add column if not exists mp_price_minor integer;

comment on column public.plans.mp_price_minor is
  'Monthly price in whole CLP for Mercado Pago. Null = not sold through Mercado Pago.';
