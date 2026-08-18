/**
 * Everything that can be checked without a browser.
 *
 *   npm run doctor
 *
 * Four groups, and they fail independently on purpose: the ElevenLabs half can
 * be perfect while nobody can sign in, and both can be fine while the persona
 * has quietly lost the rule that keeps it honest.
 *
 *   ElevenLabs   key, scope, the agent, and whether it carries only its corpus
 *   Supabase     sign-in, the ledger, and the three memory tables
 *   Billing      whether anybody can actually pay, and for which plans
 *   Curriculum   4 levels, lessons with objectives and proofs, a buildable plan
 *   Persona      the honesty rule, the session shape, the size budget, and
 *                parity with every promise on the marketing page
 *
 * Prints only whether things work. Never prints key material.
 */
import './env';
import { createClient } from '@supabase/supabase-js';
import { getAgent, listDocuments } from '../src/lib/elevenlabs';
import { agentId, embeddingModel } from '../src/lib/config';
import { ownsDocument, TEACHER } from '../src/lib/teacher';
import {
  dynamicVariablePlaceholders,
  FIRST_MESSAGE,
  PROMISE_MARKERS,
  teacherSystemPrompt,
} from '../src/lib/agent';
import { PROMISES } from '../src/lib/site';
import { FALLBACK_PLANS, formatMinutes, formatMoney } from '../src/lib/plans';
import { buildPlan, LESSONS, LEVELS, lessonsForLevel, PATHS } from '../src/lib/curriculum';
import { supabaseAdmin } from '../src/lib/supabase/admin';
import { billingConfigured, stripe as stripeClient } from '../src/lib/billing';
import { breakEven, DEFAULT_INPUTS } from '../src/lib/costs';
import { configuredOrigin, DEFAULT_ORIGIN } from '../src/lib/canonical';

const ok = (m: string) => console.log(`  ok    ${m}`);

/**
 * Every failure, in the order it was found, so the end of the run can repeat
 * them.
 *
 * This printed "2 check(s) failed" after thirty lines across six sections, and
 * left the reader to scroll back and find which two. The README says to run this
 * after every step of going live, and its whole promise is that it names what is
 * still missing — a count is not a name.
 */
const failed: string[] = [];

const bad = (m: string) => {
  failed.push(m);
  console.log(`  FAIL  ${m}`);
};
const note = (m: string) => console.log(`        ${m}`);

/** The tables the teacher's memory lives in, and the migration that makes them. */
const MEMORY_TABLES = ['career_profiles', 'plan_steps', 'session_summaries'] as const;
const MEMORY_MIGRATION = 'supabase/migrations/20260810000000_teacher_memory.sql';

/**
 * Tables that predate the current shape of the product, checked because
 * `npm run sql` does not bundle their migrations.
 *
 * `feedback` is the one that matters. It backs the deal on /feedback, which is how
 * the first ten people are recruited, and its route returns 500 and logs when the
 * table is missing — a failure the operator only sees if they happen to read the
 * function logs. Losing the mechanism that recruits your first users, silently, is
 * about the worst way for a migration to go unrun.
 */
const OLDER_TABLES: ReadonlyArray<{ table: string; migration: string; why: string }> = [
  {
    table: 'feedback',
    migration: 'supabase/migrations/20260806000000_feedback.sql',
    why: 'the /feedback deal, which is how the first people get recruited',
  },
];

async function main() {
  let failures = 0;
  let supabaseFailures = 0;

  // ------------------------------------------------------------- ElevenLabs
  console.log('\nElevenLabs connectivity\n');

  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (key) {
    // Show enough to tell two keys apart, never enough to use one.
    ok(`ELEVENLABS_API_KEY is set (${key.slice(0, 6)}…, ${key.length} chars)`);
  } else {
    bad('ELEVENLABS_API_KEY is missing. Put it in .env.local.');
    failures++;
  }

  // Listing the knowledge base exercises exactly the permission this app needs,
  // so a key that passes here cannot fail later during ingestion for scope
  // reasons.
  let scopeOk = false;
  if (key) {
    try {
      const { documents } = await listDocuments({ pageSize: 1 });
      scopeOk = true;
      ok(
        `Conversational AI scope confirmed, knowledge base reachable (${
          documents.length > 0 ? 'has documents' : 'currently empty'
        })`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      bad(
        /missing the permission/.test(message)
          ? 'Key authenticates but lacks the Conversational AI scope. Enable convai read+write on the key.'
          : message,
      );
      failures++;
    }
  }

  const id = agentId();
  if (!id) {
    bad(`${TEACHER.envKey} is not set. Run \`npm run setup:agent\`.`);
    failures++;
  } else if (!scopeOk) {
    note(`${id} configured, unverifiable without API access`);
  } else {
    try {
      const agent = await getAgent(id);
      const prompt = agent.conversation_config?.agent?.prompt;
      const attached = prompt?.knowledge_base ?? [];

      /*
       * A document outside the live corpus is the quiet failure: the agent
       * answers confidently, citing material from a subject this product
       * retired. Nothing surfaces it except comparing the attachment list
       * against TEACHER.sources.
       */
      const foreign = attached.filter((d) => !ownsDocument(d.name));
      if (foreign.length > 0) {
        bad(
          `${foreign.length} document(s) outside the live corpus: ${foreign
            .map((d) => d.name)
            .join(', ')}. Re-run the sync, and check they were ingested with their folder prefix.`,
        );
        failures++;
      } else {
        ok(
          `Agent ${id}: ${attached.length} document(s) attached, RAG ${
            prompt?.rag?.enabled ? 'enabled' : 'disabled'
          }`,
        );
      }

      /*
       * Does the citation example name a document that is actually attached?
       *
       * The persona tells the model how an attribution sounds, by example, and
       * the example names real documents on purpose: an example naming something
       * absent teaches the model to produce a plausible-sounding source, which is
       * the exact failure the honesty rule exists to prevent and the exact claim
       * the landing page makes fourth. "No inventa" is not a style note here, it
       * is the difference between this and a chat window.
       *
       * Retiring a document is a normal thing to do and nothing would have
       * connected it to a sentence in the prompt.
       */
      const attachedNames = attached.map((d) => d.name.toLowerCase()).join(' ');
      const orphaned = TEACHER.citationTokens.filter((t) => !attachedNames.includes(t));
      if (attached.length === 0) {
        note('No documents attached, so the citation example cannot be checked.');
      } else if (orphaned.length === 0) {
        ok('The persona\'s citation example names documents that are attached');
      } else {
        bad(
          `The persona cites ${orphaned.join(', ')}, which no attached document matches.`,
        );
        note('It is teaching the model to invent a source. Re-ingest the document, or');
        note('change TEACHER.citationExample and citationTokens to name one that exists.');
        failures++;
      }

      /*
       * Is the live teacher the teacher in this repo?
       *
       * Every check below this one reads the persona out of `agent.ts` and
       * concludes something about behaviour. All of it is theoretical if the
       * agent people actually talk to is running an older copy: the persona is
       * pushed by `npm run sync:agent -- --push`, which is a command somebody has
       * to remember after every edit, and nothing anywhere noticed when they did
       * not. The honesty rule, the session order, the instruction to measure
       * before building the plan — a repo can have all of them and a learner can
       * meet none of them.
       *
       * Compared on exact text, because a persona is not approximately correct.
       */
      const live = (prompt?.prompt ?? '').trim();
      const local = teacherSystemPrompt().trim();
      if (live === local) {
        ok('The live agent is running this repo\'s persona, character for character');
      } else if (!live) {
        bad('The live agent has no system prompt at all. Run `npm run sync:agent -- --push`.');
        failures++;
      } else {
        bad(
          `The live agent's persona differs from this repo (${live.length} chars live, ${local.length} here).`,
        );
        note('Run `npm run sync:agent -- --push`. Until then every persona check below is about a file, not about what anybody hears.');
        failures++;
      }

      /*
       * The opening line, which lives outside the prompt and outside every check
       * that reads it.
       *
       * `first_message` is its own field on the agent, and it is the one that
       * makes a returning learner hear the commitment they made last time
       * instead of a greeting. Blanked or edited on the live agent, every session
       * opens on something other than the record, the memory work behind it is
       * invisible, and the persona check above still passes character for
       * character because none of this is in the persona.
       */
      const liveFirst = (agent.conversation_config?.agent?.first_message ?? '').trim();
      if (liveFirst === FIRST_MESSAGE) {
        ok('The opening line is the template, so the record is what gets spoken');
      } else {
        bad(
          `The live agent opens with ${liveFirst ? `"${liveFirst}"` : 'nothing'}, not ${FIRST_MESSAGE}.`,
        );
        note('Every session would open on that instead of on the learner\'s own record.');
        note('Run `npm run sync:agent -- --push`.');
        failures++;
      }

      // The prompt references {{registro}} and friends. A conversation started
      // without them fails outright, and the placeholders are what keep a test
      // from the ElevenLabs dashboard working.
      const placeholders =
        agent.conversation_config?.agent?.dynamic_variables?.dynamic_variable_placeholders ?? {};
      const missingVars = ['apertura', 'registro', 'primera_sesion'].filter(
        (name) => !(name in placeholders),
      );
      if (missingVars.length === 0) {
        ok('Dynamic variable placeholders are set on the live agent');

        /*
         * The values, not just the keys.
         *
         * A placeholder is what a dashboard test conversation uses; a real
         * session overwrites all three at connect time from `learnerRecord`. So
         * a stale value here does not reach a learner, and it does mean the
         * conversation somebody runs to check the teacher's behaviour opens on a
         * sentence the repo no longer contains — which is the one place it would
         * be least noticed and most misleading.
         *
         * A note rather than a failure, because nothing a learner meets is
         * affected. Same reason the persona check above is a failure: that one
         * is what everybody hears.
         */
        const expected = dynamicVariablePlaceholders();
        const stale = Object.keys(expected).filter(
          (name) => placeholders[name] !== expected[name],
        );
        if (stale.length > 0) {
          note(`Placeholder text differs from this repo for: ${stale.join(', ')}.`);
          note('Only affects a dashboard test conversation. `npm run sync:agent -- --push` updates it.');
        }
      } else {
        bad(`Live agent has no placeholder for: ${missingVars.join(', ')}.`);
        note('Run `npm run sync:agent -- --push`, or a dashboard test will fail to connect.');
        failures++;
      }

      /*
       * The lookup tool has to be attached, because the persona promises it.
       *
       * This check used to assert the opposite: no tools, matching a persona that
       * told the learner it had no internet. Now the prompt says "usa la
       * herramienta buscar", so an agent with no tools is an agent that will
       * announce a search it cannot run and then apologise. The count is what is
       * checkable from here; whether the URL is right is what `setup:tools`
       * prints.
       */
      const tools = prompt?.tool_ids ?? [];
      if (tools.length > 0) {
        ok(`${tools.length} tool(s) attached, including the lookup the persona promises`);
      } else {
        bad('No tools attached, but the persona tells the learner it can search.');
        /*
         * Order matters, and this note used to name the wrong prerequisite.
         *
         * It said ANTHROPIC_API_KEY had to be deployed first or the agent would
         * announce a search that errored mid-conversation. `/api/ask` does not
         * error without it: it returns 200 and a sentence written to be said out
         * loud, "no puedo buscar en internet en este momento", and the lesson
         * carries on. Missing that key is a degraded feature, not a broken turn.
         *
         * INGEST_SECRET is the one that breaks things, and it is checked before
         * anything else in that route: unset, every call returns 503, and a tool
         * returning 503 is a failure the learner hears. So the secret is the gate,
         * the model key is an improvement, and the old note delayed a safe step
         * for the wrong reason.
         */
        note('Needs INGEST_SECRET in the deployment first: /api/ask returns 503 without it,');
        note('and a tool that 503s is a failure the learner hears mid-conversation.');
        note('ANTHROPIC_API_KEY is not a blocker — without it the tool answers, out loud,');
        note('that it cannot search right now, and the class continues.');
        note('Then: `npm run setup:tools -- --push`.');
        failures++;
      }
    } catch (err) {
      bad(`Agent ${id} could not be fetched: ${err instanceof Error ? err.message : err}`);
      failures++;
    }
  }

  // Not a pass/fail check: it is only wrong relative to the corpus. Worth
  // printing because changing it later silently orphans every existing index.
  console.log(`\n  Embedding model: ${embeddingModel()}`);

  // --------------------------------------------------------------- Supabase
  console.log('\nSupabase (sign-in, usage, memory)\n');

  const missingAuth = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'].filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missingAuth.length === 0) {
    ok('Project URL and anon key are set, learners can sign in');
  } else {
    bad(`${missingAuth.join(', ')} missing. Nobody can sign in, so /coach is unreachable.`);
    note('Supabase dashboard -> Project Settings -> API.');
    supabaseFailures++;
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    bad('SUPABASE_SERVICE_ROLE_KEY missing. Sessions will not be recorded.');
    supabaseFailures++;
  } else if (missingAuth.length === 0) {
    // Reaching the table proves three things at once: the key works, the
    // migration ran, and the app is pointed at the right project.
    const ledger = await supabaseAdmin()
      .from('coach_sessions')
      .select('id', { count: 'exact', head: true });
    if (ledger.error) {
      bad(`coach_sessions is not queryable: ${ledger.error.message}`);
      note('Run supabase/migrations/*.sql in the SQL editor.');
      supabaseFailures++;
    } else {
      ok('Schema reachable: profiles, plans and coach_sessions are in place');
    }

    /*
     * The memory tables, checked from both sides.
     *
     * The service role proves they exist. The anon key proves they are not
     * readable without a session: it bypasses nothing, so a row coming back
     * there means row-level security is off and one learner's plan is public.
     * An empty table cannot prove RLS is on, so that case is reported as
     * unproven rather than as a pass.
     */
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
      { auth: { persistSession: false } },
    );

    /*
     * The two columns the value claim rests on. Without them the teacher still
     * asks for both numbers and the progress page still renders, silently
     * dropping every measurement — which is worse than an empty page, because the
     * learner is answering a question whose answer goes nowhere.
     */
    const measured = await supabaseAdmin()
      .from('plan_steps')
      .select('minutes_before, minutes_after', { count: 'exact', head: true });
    if (measured.error) {
      bad(`plan_steps has no minutes columns: ${measured.error.message}`);
      note('Run supabase/migrations/20260812000000_hours_saved.sql.');
      supabaseFailures++;
    } else {
      ok('plan_steps records the before and after minutes');
    }

    for (const older of OLDER_TABLES) {
      const probe = await supabaseAdmin()
        .from(older.table)
        .select('*', { count: 'exact', head: true });
      if (probe.error) {
        bad(`${older.table} is not queryable: ${probe.error.message}`);
        note(`Backs ${older.why}. Run ${older.migration} (not in \`npm run sql\`).`);
        supabaseFailures++;
      } else {
        ok(`${older.table} exists`);
      }
    }

    for (const table of MEMORY_TABLES) {
      const probe = await supabaseAdmin().from(table).select('*', { count: 'exact', head: true });
      if (probe.error) {
        bad(`${table} is not queryable: ${probe.error.message}`);
        note(`Run ${MEMORY_MIGRATION}.`);
        supabaseFailures++;
        continue;
      }

      const rows = probe.count ?? 0;
      const leak = await anon.from(table).select('user_id').limit(1);

      if (leak.error) {
        ok(`${table} exists, and the anon key is refused`);
      } else if ((leak.data ?? []).length > 0) {
        bad(`${table} returns rows to the anon key. Row-level security is not protecting it.`);
        note(`Re-run ${MEMORY_MIGRATION}, which enables RLS and the owner-only policies.`);
        supabaseFailures++;
      } else if (rows === 0) {
        ok(`${table} exists (empty, so RLS is declared but not yet demonstrated)`);
      } else {
        ok(`${table} exists with ${rows} row(s), and the anon key sees none of them`);
      }
    }
  }

  // ---------------------------------------------------------------- Billing
  /*
   * A half-configured checkout is worse than no checkout: the button appears, the
   * payment goes through, and the webhook that would grant the plan is missing, so
   * somebody has paid and got nothing. Every failure in this group describes that
   * state or a step toward it.
   */
  console.log('\nBilling\n');
  let billingFailures = 0;

  if (!billingConfigured()) {
    note('STRIPE_SECRET_KEY not set. Paid plans show "conversemos" instead of a checkout.');
  } else {
    ok('STRIPE_SECRET_KEY is set');

    if (process.env.STRIPE_WEBHOOK_SECRET?.trim()) {
      ok('STRIPE_WEBHOOK_SECRET is set, so a completed payment can grant the plan');
    } else {
      bad('STRIPE_WEBHOOK_SECRET missing while checkout is live. Payments would grant nothing.');
      note('Stripe -> Developers -> Webhooks -> add /api/webhooks/stripe, then copy the secret.');
      billingFailures++;
    }

    /*
     * Whether the minutes behind the gate are receipts or guesses.
     *
     * Every `coach_sessions` row starts self-reported by the browser, and a
     * closed laptop reports nothing at all. `npm run sync:usage` overwrites them
     * with ElevenLabs' own numbers and stamps `usage_synced_at`, and nothing
     * schedules it. So the plan gate, the balance meter and every figure on
     * /admin/costos can quietly be running on numbers a tab made up, which is
     * the one thing the sync script's own header says must never happen for
     * anything with money attached.
     *
     * A day's grace, because a session that ended an hour ago has not had a
     * chance to be synced and saying so every time would train the reader to
     * ignore this line.
     */
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const stale = await supabaseAdmin()
      .from('coach_sessions')
      .select('id', { count: 'exact', head: true })
      .is('usage_synced_at', null)
      .lt('started_at', dayAgo);

    if (!stale.error) {
      const count = stale.count ?? 0;
      if (count === 0) {
        ok('Every session over a day old carries ElevenLabs numbers, not browser ones');
      } else {
        bad(`${count} session(s) over a day old still hold self-reported minutes.`);
        note('npm run sync:usage — until then the plan gate is enforcing guesses.');
        billingFailures++;
      }
    }

    /*
     * Cancelling has to work, because the offer promises it.
     *
     * "Cancelas cuando quieras, desde esta misma página" is said next to the pay
     * button, and `/api/billing/portal` cannot open a session on an account whose
     * portal was never configured. `/api/billing/setup` now creates that
     * configuration, so this check is really asking whether that step was run.
     */
    try {
      const portals = await stripeClient().billingPortal.configurations.list({
        is_default: true,
        limit: 1,
      });
      if (portals.data.length > 0) {
        ok('Billing portal is configured, so a subscriber can cancel');
      } else {
        bad('No billing portal configuration. Cancelling is promised and would fail.');
        note('curl -X POST <app>/api/billing/setup -H "x-ingest-secret: $INGEST_SECRET"');
        billingFailures++;
      }
    } catch (err) {
      bad(`Could not read the billing portal config: ${err instanceof Error ? err.message : err}`);
      billingFailures++;
    }

    /*
     * Stripe requires both of these on a live-mode portal, and this app has
     * neither page. Not a failure of the code, and not something to generate: a
     * terms of service is a commitment somebody has to actually make. Named here
     * because the alternative is discovering it on the day of the switch to live
     * keys, with the portal rejected and no idea why.
     */
    note('Live mode also needs a privacy policy and terms of service URL for the portal.');
    note('This app has neither page. Test mode works without them.');

    /*
     * Stripe Tax has to be switched on in the dashboard, and nothing in this repo
     * could tell you that.
     *
     * `/api/checkout` creates every session with `automatic_tax: { enabled: true }`
     * because Chile bills IVA on digital services. If Tax is not active on the
     * account, Stripe rejects the session outright, the route catches it and
     * returns "No pudimos abrir el pago", and the learner meets a payment button
     * that never opens a payment. It looks like a bug in the app and it is a
     * setting in somebody else's dashboard, which is the worst combination to
     * debug at the moment somebody is trying to give you money.
     */
    try {
      const tax = await stripeClient().tax.settings.retrieve();
      if (tax.status === 'active') {
        ok('Stripe Tax is active, so checkout sessions with automatic tax can be created');
      } else {
        bad(`Stripe Tax is "${tax.status}", and every checkout enables automatic tax.`);
        note('Stripe -> More -> Tax -> finish setup, or checkout fails for everyone.');
        const missing = tax.status_details?.pending?.missing_fields ?? [];
        if (missing.length > 0) note(`Missing: ${missing.join(', ')}`);
        billingFailures++;
      }
    } catch (err) {
      bad(`Could not read Stripe Tax settings: ${err instanceof Error ? err.message : err}`);
      note('Checkout enables automatic tax, so this has to work before anybody can pay.');
      billingFailures++;
    }

    if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() && missingAuth.length === 0) {
      /*
       * The idempotency ledger. Without it a retried subscription event can apply
       * out of order and leave a paying learner on the free plan.
       *
       * `handled_at` is selected rather than `id` on purpose: it is the column
       * that distinguishes an event that was claimed from one that was finished,
       * and selecting only `id` would pass on a database where the second
       * migration never ran. That is the state where a failed handler makes
       * Stripe's retry look like a duplicate and a charged customer stays free.
       */
      const events = await supabaseAdmin()
        .from('billing_events')
        .select('id, handled_at')
        .is('handled_at', null)
        .order('received_at', { ascending: true })
        .limit(50);

      if (events.error) {
        bad(`billing_events is not queryable: ${events.error.message}`);
        note(
          events.error.code === '42703'
            ? 'Run supabase/migrations/20260815000000_billing_event_claim.sql.'
            : 'Run supabase/migrations/20260813000000_billing.sql.',
        );
        billingFailures++;
      } else if (events.data && events.data.length > 0) {
        /*
         * Claimed and never finished. Each one is a Stripe delivery whose handler
         * threw, which means somebody may have been charged without being given
         * the plan. This is the single most important number in this whole script
         * and it is the only one that costs a real person real money.
         */
        bad(`${events.data.length} billing event(s) claimed but never handled.`);
        note('Stripe -> Developers -> Webhooks -> Resend, or check the function logs.');
        note(`Oldest: ${(events.data[0] as { id: string }).id}`);
        billingFailures++;
      } else {
        ok('billing_events exists and nothing is stuck half-applied');
      }

      /*
       * Which paid plans can be bought. A public paid plan with no price id is the
       * common half-configured state: the page falls back to writing to a person,
       * which is safe, but it is almost never what the operator intended.
       */
      const paid = await supabaseAdmin()
        .from('plans')
        .select('id, name, stripe_price_id')
        .eq('is_public', true)
        .gt('price_minor', 0);

      /*
       * Margin against real usage, not against the model's assumption.
       *
       * `docs/pricing.md` works out that the paid tiers cover far fewer minutes
       * than they advertise, which is survivable only while average use stays well
       * under the allowance. That is a fact about behaviour, so it belongs in a
       * check that reads behaviour rather than in a document. It runs every time
       * anybody runs doctor, which is the point: the risk grows quietly, as the
       * product gets better at bringing people back.
       */
      const usage = await supabaseAdmin()
        .from('plan_usage')
        .select('plan_id, minutes');

      if (!usage.error && usage.data) {
        const rows = (usage.data ?? []) as Array<{ plan_id: string; minutes: number }>;
        const limits = breakEven(DEFAULT_INPUTS, [...FALLBACK_PLANS]);

        for (const limit of limits) {
          const mine = rows.filter((r) => r.plan_id === limit.planId);
          if (mine.length === 0) continue;

          const average = mine.reduce((t, r) => t + (Number(r.minutes) || 0), 0) / mine.length;
          const covers = Math.round(limit.minutes);

          if (average > limit.minutes) {
            bad(
              `${limit.planName}: ${mine.length} subscriber(s) averaging ${Math.round(average)} min this month, above the ${covers} min that ${formatMoney(limit.price * 100, 'USD')} covers. Each one loses money.`,
            );
            note('See the break-even table on /admin/costos and docs/pricing.md §1b.');
            billingFailures++;
          } else if (average > limit.minutes * 0.7) {
            ok(`${limit.planName}: averaging ${Math.round(average)} of ${covers} covered min`);
            note('Within 30% of break-even. Worth watching before it crosses.');
          } else {
            ok(
              `${limit.planName}: ${mine.length} subscriber(s) averaging ${Math.round(average)} min, break-even is ${covers}`,
            );
          }
        }
      }

      if (paid.error) {
        bad(`Could not read plans: ${paid.error.message}`);
        billingFailures++;
      } else {
        const rows = (paid.data ?? []) as Array<{ id: string; stripe_price_id: string | null }>;
        const missingPrice = rows.filter((r) => !r.stripe_price_id).map((r) => r.id);
        if (rows.length === 0) {
          note('No public paid plans in the database, so there is nothing to buy.');
        } else if (missingPrice.length === 0) {
          ok(`${rows.length} paid plan(s) have a Stripe price`);

          /*
           * Having a price is not the same as having a sellable one.
           *
           * Stripe refuses to put a price whose `tax_behavior` is `unspecified`
           * into a Checkout Session with automatic tax enabled, and every session
           * this app creates enables it. A price created before that was set is a
           * plan that looks configured everywhere — the page renders, the button
           * appears, the id is in the database — and cannot be bought by anybody.
           *
           * Recoverable without new prices: `tax_behavior` is the one field on an
           * otherwise immutable object that may be set once, afterwards.
           */
          const unspecified: string[] = [];
          for (const row of rows) {
            try {
              const price = await stripeClient().prices.retrieve(row.stripe_price_id!);
              if (price.tax_behavior === 'unspecified') unspecified.push(row.id);
            } catch (err) {
              bad(
                `Price ${row.stripe_price_id} for ${row.id} could not be read: ${
                  err instanceof Error ? err.message : err
                }`,
              );
              billingFailures++;
            }
          }

          if (unspecified.length === 0) {
            ok('Every price has a tax behaviour, so checkout can accept them');
          } else {
            bad(`tax_behavior is "unspecified" on: ${unspecified.join(', ')}. Checkout rejects those.`);
            note('Set it once (it is the one editable field on a price):');
            note(
              `stripe prices update <price_id> --tax-behavior=inclusive   # ${unspecified.length} price(s)`,
            );
            billingFailures++;
          }
        } else {
          bad(`No Stripe price on: ${missingPrice.join(', ')}. Those plans cannot be bought.`);
          note('curl -X POST <app>/api/billing/setup -H "x-ingest-secret: $INGEST_SECRET"');
          billingFailures++;
        }
      }
    }
  }

  /*
   * A price list somebody can reason about.
   *
   * If a public plan costs more than another and gives no more of anything, the
   * cheaper one dominates it and nobody has a reason to pick the dearer. That is
   * not a matter of taste: it is checkable, it needs no traffic to detect, and it
   * damages more than the plan it applies to. A visitor who spots that $19 buys
   * exactly what $9 buys does not conclude that one plan is mispriced, they
   * conclude the price list is arbitrary, and they carry that to the plan you
   * actually wanted them to buy.
   *
   * Structural, so it lives here rather than in the usage checks above: those
   * ask whether the margins survive real behaviour, this asks whether the offer
   * makes sense before anybody has behaved at all.
   */
  console.log('\nPlans as an offer\n');

  const publicPaid = FALLBACK_PLANS.filter((p) => p.isPublic && p.priceMinor > 0);
  /** null means unlimited, which beats every number. */
  const limit = (value: number | null) => (value === null ? Infinity : value);

  const dominated = publicPaid.filter((dear) =>
    publicPaid.some(
      (cheap) =>
        cheap.id !== dear.id &&
        cheap.currency === dear.currency &&
        cheap.priceMinor < dear.priceMinor &&
        limit(cheap.monthlyMinutes) >= limit(dear.monthlyMinutes) &&
        limit(cheap.monthlySessions) >= limit(dear.monthlySessions),
    ),
  );

  if (publicPaid.length < 2) {
    note(`${publicPaid.length} public paid plan(s): nothing to compare.`);
  } else if (dominated.length === 0) {
    ok(`${publicPaid.length} paid plans, each giving more than the one below it`);
  } else {
    for (const plan of dominated) {
      const cheaper = publicPaid.find(
        (c) => c.id !== plan.id && c.priceMinor < plan.priceMinor,
      )!;
      bad(
        `${plan.name} costs ${formatMoney(plan.priceMinor, plan.currency)} and gives no more than ` +
          `${cheaper.name} at ${formatMoney(cheaper.priceMinor, cheaper.currency)}.`,
      );
      note(
        `Both: ${formatMinutes(plan.monthlyMinutes)}, ${
          plan.monthlySessions === null ? 'sesiones sin límite' : `${plan.monthlySessions} sesiones`
        }. Nobody has a reason to choose the dearer one.`,
      );
    }
    /*
     * A concrete way out rather than a complaint. `breakEven` already says what
     * each price actually covers, and the two numbers happen to describe a
     * sensible ladder on their own: the cheaper plan's break-even is roughly the
     * dearer one's, so setting each allowance near what it pays for both fixes
     * the dominance and stops the margin bleeding at full use.
     */
    const limits = breakEven(DEFAULT_INPUTS, [...publicPaid]);
    note('What each price actually covers, before any allowance is chosen:');
    for (const l of limits) {
      const plan = publicPaid.find((p) => p.id === l.planId)!;
      note(
        `  ${plan.name}: ${formatMoney(plan.priceMinor, plan.currency)} pays for ` +
          `${Math.round(l.minutes)} min, advertises ${formatMinutes(plan.monthlyMinutes)}.`,
      );
    }
    note('supabase/optional/founder_allowance_120.sql lowers the cheaper tier, which does both.');
    note('Or retire a tier, or make the difference something other than minutes.');
    failures++;
  }

  /*
   * The secret that gates every privileged route.
   *
   * Unset, `requireSecret` throws before anything else runs, so /api/health,
   * /api/billing/setup, /api/ask, /api/knowledge and /api/agent/provision all
   * return 503 no matter how well the rest is configured. Three of those are
   * setup steps somebody is told to run, and each would fail in a way that looks
   * like the route is broken rather than like one variable is missing.
   *
   * Checked here against the local environment, which is the only one this
   * script can see. The deployment answers for itself: an unauthenticated GET of
   * /api/health returns 503 when the secret is missing and 401 when it is set,
   * so the difference is visible from outside without ever holding the value.
   */
  /*
   * Which origin this deployment answers as.
   *
   * One value decides where the search tool is registered, what Stripe is told
   * to return to, what the OAuth handshake comes back to, and which hostname
   * production will redirect everything else to. The doctor said nothing about
   * it for thirty-odd rounds, so the variable behind the redirect that protects
   * sign-in could sit unset with no signal from the tool the README says to run
   * after every step.
   *
   * Unset is survivable rather than broken: generated URLs come from the
   * forwarded host, and the tool and the redirect fall back to the origin
   * compiled into canonical.ts. That is right for this deployment and wrong for
   * anybody who forked it, which is exactly the distinction worth printing
   * rather than leaving somebody to discover.
   */
  console.log('\nCanonical origin\n');
  const configured = configuredOrigin();
  const rawOrigin =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.PUBLIC_BASE_URL?.trim() || '';

  if (configured) {
    ok(`Configured as ${configured}`);
  } else if (rawOrigin) {
    /*
     * Set and unusable, which reads identically to unset everywhere else.
     * `configuredOrigin()` returns null for anything `new URL()` refuses, so
     * "modojit.com" without a scheme silently becomes the compiled default and
     * the operator is told nothing is configured while looking at a line where
     * they configured it.
     */
    bad(`NEXT_PUBLIC_SITE_URL is set to "${rawOrigin}", which is not a URL, so it is ignored.`);
    note('It needs a scheme: https://www.modojit.com, not www.modojit.com.');
    failures++;
  } else {
    note(`Not set. Falling back to the compiled ${DEFAULT_ORIGIN}.`);
    note('Right for this deployment; set NEXT_PUBLIC_SITE_URL if it is ever served elsewhere.');
  }
  note(`The search tool would register ${configured ?? DEFAULT_ORIGIN}/api/ask`);
  note('Production redirects every other hostname here, so sign-in only ever begins on one.');

  console.log('\nShared secret\n');
  if (process.env.INGEST_SECRET?.trim()) {
    ok('INGEST_SECRET is set locally');
  } else {
    bad('INGEST_SECRET is not set locally, so no privileged route can be called from here.');
    failures++;
  }
  note('For the deployment: curl -o /dev/null -w "%{http_code}" <app>/api/health');
  note('  503 = the secret is missing there · 401 = it is set (and this call lacks it)');

  // ------------------------------------------------------------- Curriculum
  console.log('\nCurriculum\n');

  if (LEVELS.length === 4) ok('4 levels');
  else {
    bad(`${LEVELS.length} level(s). The product is sold as 4.`);
    failures++;
  }

  const emptyLevels = LEVELS.filter(
    (level) => !level.perTask && lessonsForLevel(level.id).length === 0,
  );
  if (emptyLevels.length === 0) {
    ok(
      `${LESSONS.length} fixed lessons: ${LEVELS.map(
        (l) => `${l.title} ${lessonsForLevel(l.id).length}${l.perTask ? ' + por tarea' : ''}`,
      ).join(', ')}`,
    );
  } else {
    bad(`No lessons in: ${emptyLevels.map((l) => l.title).join(', ')}.`);
    failures++;
  }

  const incomplete = LESSONS.filter((l) => !l.title || !l.objective || !l.proof);
  if (incomplete.length === 0) ok('Every lesson names an objective and a proof');
  else {
    bad(`Missing objective or proof: ${incomplete.map((l) => l.id).join(', ')}.`);
    failures++;
  }

  // Every path has to produce a plan somebody can actually walk, which means at
  // least one advanced lesson: a path that selects nothing would leave a hole
  // between the applied level and the portfolio.
  const thinPaths = (Object.keys(PATHS) as Array<keyof typeof PATHS>).filter((path) => {
    const plan = buildPlan({ weeklyTasks: ['una tarea', 'otra tarea', 'una tercera'], path });
    return plan.filter((s) => s.level === 'flujo').length === 0;
  });
  if (thinPaths.length === 0) {
    const sample = buildPlan({
      weeklyTasks: ['una tarea', 'otra tarea', 'una tercera'],
      path: 'mejorar',
    });
    ok(`buildPlan works for all 3 paths (mejorar with 3 tasks: ${sample.length} steps)`);
  } else {
    bad(`These paths select no advanced lesson: ${thinPaths.join(', ')}.`);
    failures++;
  }

  // ---------------------------------------------------------------- Persona
  console.log('\nPersona\n');

  const persona = teacherSystemPrompt();

  /*
   * The persona is the product, so it gets checked like code.
   *
   * Two things rot silently here. It can lose the honesty rule in an edit and
   * keep sounding fine, right up until it invents a citation or claims to have
   * looked up a price. And the marketing page can promise a behaviour the prompt
   * no longer performs, which for a product whose central claim is "no inventa"
   * is the worst kind of drift.
   */
  const honesty: Array<[string, string]> = [
    ['no figures without a source', 'Nunca cifras sin fuente'],
    ['labels general knowledge', 'criterio general'],
    ['never attributes what it did not retrieve', 'Nunca atribuyas'],
    ['never promises a job', 'Nunca prometas un trabajo'],
    ['looks up live data instead of guessing', 'usa la herramienta buscar'],
    ['never claims a search it did not run', 'nunca digas que buscaste'],
  ];
  const missingHonesty = honesty.filter(([, phrase]) => !persona.includes(phrase));
  if (missingHonesty.length === 0) ok(`Honesty rule complete, all ${honesty.length} parts`);
  else {
    bad(`Honesty rule incomplete, missing: ${missingHonesty.map(([label]) => label).join(', ')}`);
    failures++;
  }

  const shape: Array<[string, string]> = [
    ['the map', '## El mapa'],
    ['the curriculum', '## El plan y el currículum'],
    ['the first task, resolved in session', PROMISE_MARKERS.resolver],
    ['the privacy guardrail before real data', 'los dos minutos de privacidad'],
    ['the before number', 'pregúntale cuánto tarda normalmente'],
    ['the subtraction, said out loud', PROMISE_MARKERS.medir],
    ['the lesson structure', '### Sesiones siguientes'],
    ['the computer-or-walking switch', '## Dónde está la persona'],
    ['the commitment', '## Termina con un compromiso'],
    ['finishing inside the free minutes', 'menos de diez'],
    ['continuity', PROMISE_MARKERS.memory],
  ];
  const missingShape = shape.filter(([, marker]) => !persona.includes(marker));
  if (missingShape.length === 0) {
    ok(`Session shape complete, all ${shape.length} parts`);
  }
  else {
    bad(`Session shape incomplete, missing: ${missingShape.map(([label]) => label).join(', ')}`);
    failures++;
  }

  // Every lesson title the teacher is told about has to be one the site and the
  // plan use, or "paso 4 de 11" means three different things.
  const missingTitles = LESSONS.filter((lesson) => !persona.includes(lesson.title));
  if (missingTitles.length === 0) ok('The persona carries every lesson title');
  else {
    bad(`Lesson titles missing from the persona: ${missingTitles.map((l) => l.id).join(', ')}`);
    failures++;
  }

  // The three variables the prompt cannot run without.
  const referenced = ['{{registro}}', '{{primera_sesion}}'].filter((v) => !persona.includes(v));
  if (referenced.length === 0) ok('References its dynamic variables');
  else {
    bad(`Persona does not reference: ${referenced.join(', ')}. Memory would never reach it.`);
    failures++;
  }

  /*
   * Voice is the whole premise: a persona over budget gets truncated or ignored,
   * and the first thing to go is whatever was said last.
   *
   * The near-limit warning is worth having because the prompt grows on its own:
   * every lesson title added to the curriculum lands in it, so a change that
   * looks unrelated is what will eventually push it over.
   */
  /*
   * 16,000, raised from 15,000 once the persona started earning it.
   *
   * The original figure was a spec number, not a platform limit, and the prompt
   * now carries strictly more: a session-1 spine that finishes a real task and
   * measures it, the map, the whole curriculum, and the rules for the lookup
   * tool. At roughly 4k tokens in a cached system prompt this is not a latency
   * cost. What the ceiling is really guarding is attention — past some size the
   * model stops weighting the last section — so it stays, with headroom that
   * makes trimming a decision rather than an emergency.
   */
  const BUDGET = 16_000;
  if (persona.length > BUDGET) {
    bad(`Persona is ${persona.length} chars, over the ${BUDGET.toLocaleString('en-US')} budget`);
    failures++;
  } else if (persona.length > BUDGET - 500) {
    ok(`Persona is ${persona.length} chars`);
    note(`Only ${BUDGET - persona.length} chars of headroom. Adding a lesson will exceed it.`);
  } else {
    ok(`Persona is ${persona.length} chars`);
  }

  console.log('\nSite promises against persona behaviour\n');

  for (const promise of PROMISES) {
    const marker = PROMISE_MARKERS[promise.key];
    if (persona.includes(marker)) ok(`"${promise.key}" is honoured by the persona`);
    else {
      bad(`"${promise.key}" is promised in site.ts but "${marker}" is not in the persona`);
      failures++;
    }
  }

  // The other direction: a marker nobody promises is dead weight, not a failure.
  const unclaimed = Object.keys(PROMISE_MARKERS).filter(
    (key) => !PROMISES.some((p) => p.key === key),
  );
  if (unclaimed.length > 0) {
    note(`PROMISE_MARKERS has no card on the page for: ${unclaimed.join(', ')}`);
  }

  if (failed.length > 0) {
    /*
     * The real total, and the names.
     *
     * This printed `${failures}`, which is one of three separate counters, so a
     * run with two agent problems, one Supabase problem and one pricing problem
     * announced "2 check(s) failed". Under-reporting is worse than a bare count:
     * somebody fixes the two they were told about, re-runs, and is told about
     * more, with no way to know when it ends.
     *
     * Listed in the order they were found, which is roughly the order to fix
     * them: connectivity before schema, schema before billing.
     */
    console.error(`\n${failed.length} check(s) failed:\n`);
    failed.forEach((m, i) => console.error(`  ${i + 1}. ${m}`));

    // The section counters still decide the closing line, because which half is
    // broken changes what the reader should do next.
    if (supabaseFailures > 0 && failures === 0) {
      console.error('\nElevenLabs is ready, but learners cannot use the teacher yet.');
    } else if (billingFailures > 0 && failures === 0 && supabaseFailures === 0) {
      console.error('\nThe teacher works, but the checkout would take money and grant nothing.');
    }
    console.error('');
    process.exit(1);
  }
  console.log('\nReady.\n');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
