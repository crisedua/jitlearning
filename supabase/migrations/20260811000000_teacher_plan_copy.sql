-- The plan blurbs, in the words of the product that exists.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- The pricing page reads `blurb` from this table at request time, so the copy
-- shipped in the earlier migration is what visitors were still being shown after
-- the rewrite: "20 minutos para probar si estudiar hablando te sirve" on a
-- product that no longer describes itself as studying, and "estudio diario" on a
-- plan that buys one class a week.
--
-- These strings must stay identical to FALLBACK_PLANS in src/lib/plans.ts. That
-- file is only rendered when Postgres is unreachable, which is exactly when
-- nobody is watching, so a drift between the two shows up as last month's copy
-- during an outage and at no other time. This migration is one half of keeping
-- them in step; the other half is remembering that editing one means editing
-- both.

update public.plans
   set blurb = '20 minutos para hacer el diagnóstico y ver tu plan.'
 where id = 'free';

update public.plans
   set blurb = 'Una clase por semana, con memoria entre sesiones.'
 where id = 'standard';

-- Unchanged, and here so all three read together: the founder tier's promise is
-- the locked price, which is the only thing it has that `standard` does not.
update public.plans
   set blurb = 'Precio fijo para siempre. Para los primeros que se suben.'
 where id = 'founder';
