-- Somebody said they want to pay.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- Checkout is not configured yet, so the buy button on /planes opens a
-- prefilled email or WhatsApp message. That works: a person can buy, and you
-- charge them by hand. What it cannot do is leave a trace. If somebody clicks
-- "Conversemos" and then does not send the message, or sends it and the
-- notification is missed, nothing anywhere records that a person got as far as
-- deciding to pay. The funnel at /admin/embudo counts accounts, sessions and
-- finished steps, and stops one step short of the only one that pays for the
-- rest.
--
-- One row per click on a buy button. Not a purchase: an attempt, which is the
-- thing you cannot currently see and the thing worth knowing the rate of. A
-- person who clicked and never wrote is a sale that was in reach; today that
-- event is invisible, and invisible is the same as absent when you are deciding
-- whether anybody wants this.
--
-- ## Deliberately nothing free-form
--
-- No name, no email, no message, no user agent, no IP. Every column is either a
-- foreign key or checked against a fixed set, so this table cannot be used to
-- store anything a stranger typed. That is the price of writing it from a public
-- endpoint: the row is a fact about a click and cannot be anything else.
create table if not exists public.purchase_intents (
  id          uuid primary key default gen_random_uuid(),
  -- Null when the clicker was signed out, which on a public pricing page is
  -- most of them. When it is set, the intent is recoverable: you know who to
  -- write to, rather than only how many people meant to.
  user_id     uuid references auth.users (id) on delete set null,
  -- Text rather than a foreign key to plans: a click on a tier that is later
  -- retired is still evidence, and losing the history to a cascade would defeat
  -- the point of keeping it.
  plan_id     text not null,
  channel     text not null check (channel in ('email', 'whatsapp')),
  created_at  timestamptz not null default now()
);

create index if not exists purchase_intents_created_idx
  on public.purchase_intents (created_at desc);

-- RLS on, no policies: closed to every client-side role, exactly like feedback.
-- Rows arrive through the service role in /api/intent, and are read by the
-- funnel page, which is already behind the admin check.
alter table public.purchase_intents enable row level security;
