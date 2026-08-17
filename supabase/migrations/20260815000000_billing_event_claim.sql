-- Stop the duplicate gate from swallowing a payment it failed to apply.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- ## The bug
--
-- `billing_events` recorded an event id *before* the handler ran, and the route
-- treated "id already present" as "already applied". Those are not the same
-- thing, and the gap between them is where a paid upgrade disappears:
--
--   1. Stripe delivers checkout.session.completed
--   2. the id is inserted, the gate says "new", the handler starts
--   3. subscriptions.retrieve times out, or Supabase blips, or the function is
--      killed at the deadline
--   4. the route returns 500, correctly, so Stripe will retry
--   5. the retry arrives, finds the id already recorded, and returns 200
--
-- The customer has been charged and is on the free plan, permanently, with no
-- further delivery coming and nothing in any log after step 3. The webhook file
-- describes this exact outcome as the worst failure the app can have, in a
-- comment explaining why handlers return 500 — and then the dedup in front of
-- them caused it anyway.
--
-- ## The fix
--
-- Split "claimed" from "handled". The insert still claims the event, so two
-- concurrent deliveries cannot both run. `handled_at` is written only after the
-- handler succeeds, and a claimed-but-unhandled row is reprocessed on the next
-- delivery. Applying a subscription twice sets the same plan to the same value,
-- so the retry is safe; not applying it at all is not.

alter table public.billing_events
  add column if not exists handled_at timestamptz;

-- Rows written under the old semantics were recorded after being processed, so
-- they are handled by definition. Without this backfill the first retry of any
-- historical event would reprocess it, which is harmless but noisy.
update public.billing_events
  set handled_at = received_at
  where handled_at is null;

-- Finding the events that were claimed and never finished is the first question
-- anybody asks when a payment did not land.
create index if not exists billing_events_unhandled_idx
  on public.billing_events (received_at)
  where handled_at is null;
