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
import { readdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { getAgent, listDocuments } from '../src/lib/elevenlabs';
import { agentId, embeddingModel } from '../src/lib/config';
import { ownsDocument, TEACHER } from '../src/lib/teacher';
import {
  dynamicVariablePlaceholders,
  FIRST_MESSAGE,
  PROMISE_MARKERS,
  dataCollection,
  evaluationCriteria,
  ragConfig,
  teacherSystemPrompt,
} from '../src/lib/agent';
import { PROMISES } from '../src/lib/site';
import { CLASS_CAP_MINUTES } from '../src/lib/class-length';
import { ASSUMED_SESSION_MINUTES, FALLBACK_PLANS, formatMinutes, formatMoney } from '../src/lib/plans';
import { buildPlan, LESSONS, LEVELS, lessonsForLevel, PATHS } from '../src/lib/curriculum';
import { serviceConfigured, supabaseAdmin } from '../src/lib/supabase/admin';
import { classReport } from '../src/lib/classes';
import { firstMissingRung } from '../src/lib/setup';
import { deliveryReport } from '../src/lib/delivery';
import { parity } from '../src/lib/parity';
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
  /*
   * The only table that records somebody deciding to pay.
   *
   * Checkout is not configured, so every buy button on /planes opens a
   * prefilled email or WhatsApp message, and /api/intent writes one row per
   * click. That route swallows its own errors on purpose: a person mid-click is
   * already navigating to their mail client and a failed measurement must never
   * become a failed sale.
   *
   * Which means that if this table is missing, every click is dropped in
   * silence. Nothing errors, nobody is inconvenienced, and the single event
   * worth knowing the rate of leaves no trace at all. Unchecked, the difference
   * between "nobody wants this" and "the table was never created" is invisible,
   * and those two readings lead to opposite decisions about the product.
   */
  {
    table: 'purchase_intents',
    migration: 'supabase/migrations/20260817000000_purchase_intent.sql',
    why: 'every click on a buy button, which is the only purchase signal that exists today',
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

      /*
       * One comparison, shared with /admin/estado. See `parity.ts`: both
       * surfaces used to compute this separately, which is two definitions of
       * whether the agent is right.
       */
      const check = parity({
        prompt,
        dynamicVariables: agent.conversation_config?.agent?.dynamic_variables
          ?.dynamic_variable_placeholders,
        conversation: agent.conversation_config?.conversation,
        platform_settings: (agent as unknown as { platform_settings?: never }).platform_settings,
      });

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
       * Enabled is not the same as working.
       *
       * This reported RAG enabled and stopped there, and the two numbers under
       * it are what decide whether anything is ever retrieved. `agent.ts` says
       * of the relevance gate that setting it too tight makes the agent retrieve
       * nothing and answer from general knowledge — which the persona then
       * labels honestly as general knowledge, so the class sounds correct and
       * the corpus is simply never used. A different embedding model is the same
       * shape: the documents were indexed with one, and a query embedded with
       * another matches nothing.
       *
       * Both are one dashboard edit away and neither raises anything.
       */
      if (!check.retrieval.enabled) {
        bad('RAG is disabled on the live agent, so the corpus is never consulted.');
        failures++;
      } else if (check.retrieval.drift.length > 0) {
        bad(`Retrieval is configured differently from this repo: ${check.retrieval.drift.join('; ')}.`);
        note('Too tight a gate, or a model the documents were not indexed with, retrieves nothing.');
        note('The teacher then answers from general knowledge and says so, and sounds fine doing it.');
        note('Run `npm run sync:agent -- --push`.');
        failures++;
      } else {
        const want = ragConfig();
        ok(`Retrieval matches: ${want.embedding_model} at ${want.max_vector_distance}`);
      }

      /*
       * The ceiling, checked the same way as everything else the agent holds a
       * copy of. It went unchecked and unset for a long time, and the classroom,
       * the teacher's pacing and the note above the start button now all take
       * their timing from this repo's figure. If the agent cuts sooner, all
       * three are wrong in the direction that costs the learner the subtraction,
       * and nothing on this side would see it.
       */
      if (check.liveClassCapSeconds !== null) {
        bad(
          `The agent ends a class at ${Math.round(check.liveClassCapSeconds / 60)} min; this repo ` +
            `schedules for ${CLASS_CAP_MINUTES}.`,
        );
        note('The wrap-up prompts, the teacher\'s pacing and the note on /coach all use the repo figure.');
        note('If the agent cuts sooner, the class ends before the subtraction is asked for.');
        note('Run `npm run sync:agent -- --push`.');
        failures++;
      } else {
        ok(`A class ends at ${CLASS_CAP_MINUTES} min on both sides`);
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
      if (check.persona === 'match') {
        ok(
          check.hasTool
            ? "The live agent is running this repo's persona, character for character"
            : "The live agent is running this repo's persona, without the search it cannot do",
        );
      } else if (check.persona === 'empty') {
        bad('The live agent has no system prompt at all. Run `npm run sync:agent -- --push`.');
        failures++;
      } else if (check.persona === 'foreign') {
        bad("The live agent's persona is neither variant of this repo's.");
        note('Somebody edited it in the dashboard, or the sync never ran.');
        note('Run `npm run sync:agent -- --push`.');
        failures++;
      } else {
        bad(
          check.persona === 'under-promises'
            ? 'The live persona has no lookup instructions, but a search tool is attached.'
            : 'The live persona promises a search, but no tool is attached to run it.',
        );
        note('`npm run sync:agent -- --push` pushes the variant that matches the agent.');
        failures++;
      }

      if (check.missingVariables.length === 0) {
        ok('Dynamic variable placeholders are set on the live agent');
      } else {
        bad(`Live agent has no placeholder for: ${check.missingVariables.join(', ')}.`);
        note('Run `npm run sync:agent -- --push`, or a dashboard test will fail to connect.');
        failures++;
      }

      const tools = prompt?.tool_ids ?? [];
      if (tools.length > 0) {
        ok(`${tools.length} tool(s) attached, including the lookup the persona promises`);
      } else {
        bad('No search tool attached, so the teacher cannot look anything up.');
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

      /*
       * The extraction fields, checked against the agent rather than the repo.
       *
       * `agent.test.ts` already ties every field the webhook reads to one this
       * repo declares, which catches a rename in the code. It cannot see the
       * agent. `syncAgentKnowledge` pushes `data_collection` on every sync, so
       * these normally agree, and the way they stop agreeing is somebody editing
       * the agent in the ElevenLabs dashboard, which is exactly how the persona
       * drifted before parity was checked.
       *
       * A missing field is not a degraded feature. The webhook reads that key,
       * finds nothing, and writes null: no commitment, no minutes, no lesson
       * recorded, with a 200 logged at both ends. It is the quietest way this
       * product has of stopping working.
       */
      if (check.missingFields.length === 0) {
        ok(`All ${Object.keys(dataCollection()).length} extraction fields present on the live agent`);
      } else {
        bad(`The live agent is missing ${check.missingFields.length} extraction field(s): ${check.missingFields.join(', ')}.`);
        note('The webhook reads those keys, finds nothing, and stores null, with a 200 at both ends.');
        note('Run `npm run sync:agent -- --push`.');
        failures++;
      }

      /*
       * The success criteria, same parity question as the fields above.
       *
       * Without them ElevenLabs still returns `call_successful`, and it returned
       * "success" for a class that finished no task and produced no number,
       * because it was grading a conversation and nobody had told it what this
       * conversation is for. A confident wrong verdict is worse than none: it is
       * the number an operator would check to decide the session works.
       */
      if (check.missingCriteria.length === 0) {
        ok(`All ${evaluationCriteria().length} success criteria present, so each class is marked`);
      } else {
        bad(`The live agent is missing ${check.missingCriteria.length} success criteria: ${check.missingCriteria.join(', ')}.`);
        note('Every class would come back graded "success" without being asked what it achieved.');
        note('Run `npm run sync:agent -- --push`.');
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

  let urlUnusable = false;
  const missingAuth = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'].filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missingAuth.length === 0) {
    /*
     * Set is not the same as usable.
     *
     * `createClient` throws "Invalid supabaseUrl: Must be a valid HTTP or HTTPS
     * URL" from its constructor, which is an unhandled exception here: the run
     * stops mid-section with one bare line, no failure list and no next step.
     * The tool people reach for when something is broken should not be the thing
     * that breaks on a URL missing its scheme, which is the ordinary way this
     * value gets pasted wrong.
     *
     * The same distinction NEXT_PUBLIC_SITE_URL already gets below.
     */
    const raw = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
    let parsed: URL | null = null;
    try {
      parsed = new URL(raw);
    } catch {
      parsed = null;
    }

    if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) {
      bad(`NEXT_PUBLIC_SUPABASE_URL is "${raw}", which is not an http(s) URL.`);
      note('It needs the scheme: https://xxxx.supabase.co, not xxxx.supabase.co.');
      note('Everything below this needs a client, so the rest of this section is skipped.');
      supabaseFailures++;
      urlUnusable = true;
    } else {
      ok('Project URL and anon key are set, learners can sign in');
    }
  } else {
    bad(`${missingAuth.join(', ')} missing. Nobody can sign in, so /coach is unreachable.`);
    note('Supabase dashboard -> Project Settings -> API.');
    supabaseFailures++;
  }

  if (urlUnusable) {
    // Nothing below can build a client, and a cascade of connection failures
    // would bury the one line that explains them.
  } else if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
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
      } else if (older.table === 'purchase_intents') {
        /*
         * Reported with its count, unlike the others, because this number is
         * the answer to the only question that matters about the product and
         * it is otherwise visible on one admin page nobody opens daily.
         */
        const n = probe.count ?? 0;
        ok(
          n === 0
            ? 'purchase_intents exists, and nobody has clicked a buy button yet'
            : `purchase_intents exists, and ${n} person-click(s) have said they want to pay`,
        );
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
    /*
     * Three surfaces degrade, not one. This said "paid plans show conversemos",
     * which described /planes and was written before the offer under the hours
     * and the billing portal learned to fall back too. An operator reading it
     * would picture one page behaving differently and find three.
     */
    note('STRIPE_SECRET_KEY not set. Every buy button falls back to a prefilled message:');
    note('  on /planes, and under the measured hours on /progreso, where the click is still');
    note('  recorded in purchase_intents. Somebody on a comped plan is told how to reach you');
    note('  rather than sent to a billing portal that does not exist.');
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

  /*
   * How long a class is, said twice, in two systems that cannot see each other.
   *
   * `ASSUMED_SESSION_MINUTES` is what the landing page and the pricing page tell
   * people a class takes, and what divides an allowance into a class count.
   * `CLASS_CAP_MINUTES` is when ElevenLabs hangs up. If the first is larger, the
   * product is promising a class it cuts off, and every class count on the
   * pricing page is low by the same ratio.
   */
  if (ASSUMED_SESSION_MINUTES > CLASS_CAP_MINUTES) {
    bad(
      `The site says a class takes ${ASSUMED_SESSION_MINUTES} minutes and the agent ends it at ` +
        `${CLASS_CAP_MINUTES}.`,
    );
    note('Either raise CLASS_CAP_MINUTES to what the copy promises, which costs more per class,');
    note('or lower ASSUMED_SESSION_MINUTES to what a class really is, which promises more classes.');
    note('A learner reaching the cap loses the subtraction, which is the thing they came for.');
    failures++;
  } else {
    ok(
      `A class is advertised at ${ASSUMED_SESSION_MINUTES} min and ends at ${CLASS_CAP_MINUTES}`,
    );
  }

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
    /*
     * Still a failure, because the ladder is still wrong. But an operator
     * reading this should not picture a page asking somebody to pay more for
     * less: /planes demotes a dominated tier to a list price with no button,
     * derived from these same rows. Fix the numbers and the card comes back on
     * its own.
     */
    note('Meanwhile /planes shows it as a list price with no button, so nobody is offered it.');
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
  /*
   * The secret that turns talking into a product.
   *
   * Without ELEVENLABS_WEBHOOK_SECRET the post-call route refuses every
   * delivery, so a conversation happens and nothing survives it: no profile, no
   * plan, no minutes measured, so no hours on /progreso and no offer beside
   * them. Sessions look perfect and nothing accumulates.
   *
   * The doctor had no mention of it at all — the same gap the canonical origin
   * had, on the variable with the largest silent consequence in the product.
   *
   * Being set locally is not the same as being set in the deployment, and the
   * webhook also has to be registered on the ElevenLabs side, which no variable
   * implies. The probe below distinguishes all three states from outside.
   */
  /*
   * The sources the corpus cites, still resolving.
   *
   * The teacher's fourth promise is that a figure without a source does not get
   * said, and the chain behind that is: the teacher cites the corpus, the corpus
   * cites a URL, the URL is real. The last link is the only one nothing was
   * checking, and it is the one that rots on somebody else's schedule — a
   * support article gets renamed and the teacher starts pointing a learner at a
   * page that no longer exists.
   *
   * A note rather than a failure. Link rot does not stop anybody having a class,
   * and a deployment check that fails because a third party reorganised their
   * docs would train the reader to skim this whole script.
   */
  console.log('\nCorpus sources\n');
  const corpusDir = 'knowledge';
  const urls = new Set<string>();
  /** file → the date it says it was checked against the source. */
  const verified = new Map<string, Date>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      // Retired corpora are not attached to anything, so their links are not
      // promises this product is still making.
      if (entry.isDirectory()) {
        if (entry.name !== '_retired') walk(full);
      } else if (entry.name.endsWith('.md')) {
        const text = readFileSync(full, 'utf8');
        for (const m of text.matchAll(/https?:\/\/[^\s)\]]+/g)) {
          urls.add(m[0].replace(/[.,;]$/, ''));
        }
        /*
         * Each document states when it was last checked, in one of the two
         * shapes they are written in: "Contrastado con la documentación oficial
         * el 2026-07-29" and "Datos verificados el 28 de julio de 2026".
         */
        const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
        const long = text.match(
          /(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre) de (\d{4})/i,
        );
        if (iso) {
          verified.set(full, new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`));
        } else if (long) {
          const months = [
            'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
            'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
          ];
          const month = months.indexOf(long[2]!.toLowerCase()) + 1;
          const day = long[1]!.padStart(2, '0');
          verified.set(full, new Date(`${long[3]}-${String(month).padStart(2, '0')}-${day}T00:00:00Z`));
        }
      }
    }
  };
  try {
    walk(corpusDir);
  } catch {
    note('No knowledge/ directory to read.');
  }

  if (urls.size === 0) {
    note('The live corpus cites no links.');
  } else {
    const dead: string[] = [];
    await Promise.all(
      [...urls].map(async (url) => {
        try {
          const res = await fetch(url, { method: 'GET', redirect: 'follow' });
          if (!res.ok) dead.push(`${res.status} ${url}`);
        } catch {
          dead.push(`unreachable ${url}`);
        }
      }),
    );

    if (dead.length === 0) {
      ok(`${urls.size} source link(s) in the corpus still resolve`);
    } else {
      note(`${dead.length} of ${urls.size} source link(s) no longer resolve:`);
      for (const d of dead) note(`  ${d}`);
      note('The teacher cites these by name. A dead one sends somebody to a 404.');
    }
  }

  /*
   * How old the corpus says it is.
   *
   * Every document carries the date it was checked against its source, and the
   * comparison says of itself that "este mercado cambia cada pocas semanas" and
   * that prices and model names should be treated as perishable. Nothing
   * enforced that, so the file would go on stating July's prices in a voice the
   * learner has no way to date.
   *
   * It matters more while no search tool is attached. A teacher that can look
   * things up can correct a stale figure mid-class; this one cannot, and its
   * persona now tells it to say so rather than guess, which is honest and still
   * leaves the learner without the answer.
   *
   * The thresholds come from the documents rather than from taste: a few weeks
   * is what they call the cycle, so two months is comfortably past one and is
   * worth mentioning; four months is two cycles of prices this can no longer
   * describe, which is a wrong answer rather than an old one.
   */
  if (verified.size > 0) {
    const day = 86_400_000;
    const aged = [...verified.entries()]
      .map(([file, when]) => ({ file, days: Math.floor((Date.now() - when.getTime()) / day) }))
      .sort((a, b) => b.days - a.days);

    const stale = aged.filter((a) => a.days > 120);
    const ageing = aged.filter((a) => a.days > 60 && a.days <= 120);

    if (stale.length > 0) {
      bad(`${stale.length} corpus document(s) were last checked over 4 months ago.`);
      for (const a of stale) note(`  ${a.file}: ${a.days} days`);
      note('They quote prices and model names, which the corpus itself calls perishable.');
      failures++;
    } else if (ageing.length > 0) {
      note(`${ageing.length} corpus document(s) are over 2 months old:`);
      for (const a of ageing) note(`  ${a.file}: ${a.days} days`);
    } else {
      ok(`Corpus checked ${aged[0]!.days} days ago at the oldest`);
    }
  } else {
    note('No document says when it was last checked, so nothing can tell if it is stale.');
  }

  /*
   * Has anybody spoken to the teacher that exists now.
   *
   * The closing line of this run tells whoever reads it to have a class
   * themselves before sending anybody a link, and until now that was advice with
   * nothing behind it. Both halves are readable: the agent carries
   * `metadata.updated_at_unix_secs`, and the conversations list carries when
   * each one started.
   *
   * The distinction is not pedantic. Ten real conversations exist on this agent
   * and every one of them predates the persona by more than two weeks, so what
   * they record — no minutes captured, one commitment across all of them — is
   * evidence about a teacher that no longer exists. Read as current it would
   * send somebody rewriting a persona that has never been tried; read correctly
   * it says the opposite, which is that the thing has never been tried at all.
   */
  console.log('\nUse\n');
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  const liveId = agentId();
  if (!apiKey || !liveId) {
    note('No agent to ask, so nothing here can say whether anybody has used it.');
  } else {
    try {
      const [agentRes, convRes] = await Promise.all([
        fetch(`https://api.elevenlabs.io/v1/convai/agents/${liveId}`, {
          headers: { 'xi-api-key': apiKey },
        }),
        fetch(
          `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${liveId}&page_size=30`,
          { headers: { 'xi-api-key': apiKey } },
        ),
      ]);

      const agentBody = (await agentRes.json()) as {
        metadata?: { updated_at_unix_secs?: number };
      };
      const convBody = (await convRes.json()) as {
        conversations?: Array<{ start_time_unix_secs?: number; call_duration_secs?: number }>;
      };

      const changed = (agentBody.metadata?.updated_at_unix_secs ?? 0) * 1000;
      const calls = convBody.conversations ?? [];
      // A few seconds is somebody pressing the button and hanging up, which is
      // not a class and should not read as one.
      const real = calls.filter((c) => (c.call_duration_secs ?? 0) >= 60);
      const newest = Math.max(0, ...real.map((c) => (c.start_time_unix_secs ?? 0) * 1000));

      if (real.length === 0) {
        note('No conversation over a minute has ever happened on this agent.');
        note('Nothing here has been tried by a person, only checked by a machine.');
      } else if (newest < changed) {
        // Hours matter here: a persona pushed an hour after the last class is a
        // different situation from one nobody has used in a fortnight, and
        // "0 day(s) older" reads like a bug rather than a fresh change.
        const gap = changed - newest;
        const age =
          gap < 86_400_000
            ? `${Math.max(1, Math.round(gap / 3_600_000))} hour(s)`
            : `${Math.floor(gap / 86_400_000)} day(s)`;
        /*
         * Said as what it is rather than as what it suggests.
         *
         * This read "before the persona changed" and "nobody has spoken to the
         * teacher that is live right now", from a timestamp that moves whenever
         * anything on the agent is written: a document re-synced, a criterion
         * added, a placeholder changed. Most of those change nothing anybody
         * hears, and the sentence made every one of them sound like a new
         * teacher.
         *
         * The honest version still says the useful thing. What those classes
         * heard may not be what is live, and that is worth knowing before
         * reading anything into what they produced.
         */
        note(`${real.length} class(es), and the newest ended ${age} before the agent last changed.`);
        note('What those classes heard may not be what is live now.');
      } else {
        ok(`${real.length} class(es), and at least one since the persona last changed`);
      }

      /*
       * Whether the classes that happened produced the thing being sold.
       *
       * Every page leads with the two numbers, and /progreso only shows the
       * offer when both are present, so a class that ends without them is a
       * class after which nobody is ever asked to pay. It is also the failure
       * least likely to be noticed: the conversation goes well, the learner
       * hangs up happy, and the row is simply missing a field.
       *
       * Read from the extractor's own results rather than from the database, so
       * this answers even before the post-call webhook is registered — which is
       * the state a first operator is in, and exactly when they most need to
       * know whether the session shape works.
       *
       * The most recent few only. This is one request per conversation and the
       * doctor is run often; a trend needs the funnel, not a diagnostic.
       */
      /*
       * The same question, asked by the same code as /admin/embudo.
       *
       * This had its own copy and its own bug: it counted every conversation
       * carrying any analysis, so classes from before the minute fields existed
       * were reported as classes that failed to produce them. Asked and answered
       * are different, and two implementations of that distinction is one too
       * many.
       */
      const report = await classReport();
      if (!report) {
        note('Could not read the conversations, so nothing here says whether a class worked.');
      } else if (report.analysed === 0) {
        note('No recent class carries an analysis, so nothing can be read from them.');
      } else if (report.measurable === 0) {
        note('No recent class was asked for the two numbers, so none of them says the product works.');
      } else if (report.measured === report.measurable) {
        ok(`${report.measured} of ${report.measurable} class(es) ended with both numbers`);
      } else {
        note(`${report.measured} of ${report.measurable} class(es) ended with both numbers.`);
        note('Without both, /progreso never shows the offer, so nobody is asked to pay.');
        if (report.whyNot) note(`  the extractor said: ${report.whyNot}`);
      }

      if (report && report.graded === 0) {
        note('None is graded yet: the success criteria are newer than every class on the agent.');
      } else if (report) {
        /*
         * All four, the same as /admin/embudo shows, because they fail for
         * different reasons and ask for different fixes: no task finished is
         * the session shape, no numbers is usually a unit or a clock, a missing
         * commitment is the closing being skipped, and a failed honesty check
         * is the persona. One number here and four on the page would also be
         * two accounts of the same class.
         */
        const LABELS: Record<string, string> = {
          tarea_terminada: 'finished a real task',
          dos_numeros: 'left both numbers',
          compromiso_completo: 'closed with a full commitment',
          privacidad_antes: 'warned about privacy before touching real work',
          sin_inventar: 'invented nothing',
        };
        note(`Of ${report.graded} graded class(es):`);
        // Ids from `evaluationCriteria()`, so adding a fifth criterion cannot
        // leave one surface reporting three of four. Only the wording is local.
        for (const criterion of evaluationCriteria()) {
          const passed = report.passed[criterion.id];
          const label = LABELS[criterion.id] ?? criterion.id;
          note(
            passed === undefined
              ? `  ${label}: not graded`
              : `  ${label}: ${passed} of ${report.graded}`,
          );
        }
      }

    } catch (err) {
      note(`Could not read usage: ${err instanceof Error ? err.message : err}`);
    }
  }

  /*
   * A grant nobody can verify from here.
   *
   * 20260818000000_learner_columns.sql narrows what the learner's own client may
   * update, so the rule `actions.ts` states — that a step's status comes from the
   * class and not from a checkbox — is enforced by Postgres rather than by the
   * page. Getting it wrong breaks the two forms on /progreso, and it breaks them
   * the loud way: a column privilege violation is an error, not an empty update,
   * so it lands in the logs and in the console.error beside each write.
   *
   * This cannot check it without being signed in as a learner, which the doctor
   * never is. So it says what to try instead of implying it has been tried.
   */
  if (serviceConfigured()) {
    const probe = await supabaseAdmin().from('plan_steps').select('id', { head: true, count: 'exact' });
    if (!probe.error) {
      note('After pasting 20260818000000_learner_columns.sql, save the evidence box');
      note('and the minutes box on /progreso once as a learner. Both must still write.');
    }
  }

  console.log('\nPost-call webhook\n');
  if (process.env.ELEVENLABS_WEBHOOK_SECRET?.trim()) {
    ok('ELEVENLABS_WEBHOOK_SECRET is set locally');
  } else {
    bad('ELEVENLABS_WEBHOOK_SECRET is not set locally.');
    note('Without it nothing a learner says is ever recorded: no plan, no hours, no offer.');
    failures++;
  }
  note('For the deployment, and whether ElevenLabs is actually calling it:');
  note('  curl -s -o /dev/null -w "%{http_code}" -X POST <app>/api/webhooks/elevenlabs -d "{}"');
  note('  503 = the secret is missing there · 401 = set (this call just lacks a signature)');
  note('Registering the webhook in the ElevenLabs dashboard is a separate step.');

  /*
   * The only check here that can tell the truth.
   *
   * Everything above verifies configuration, and configuration is not the thing
   * that fails. The secret can be set in both places, the probe can return 401,
   * and the webhook can still never arrive: registered against the wrong URL,
   * pointed at a preview deployment, switched off, or registered for the wrong
   * event. Every one of those is invisible to an env-var check and produces the
   * same silence.
   *
   * What the silence does is worse than losing data. `buildRecord` treats a
   * learner with no history as new, correctly, so a returning learner is
   * diagnosed again from scratch every single time. The memory that /planes
   * sells, and the reason to come back at all, quietly never happens, and the
   * learner's conclusion is not "the webhook is misconfigured", it is "this
   * thing does not remember me" — which is the one thing a teacher must do.
   *
   * A conversation with an id and no summary is that failure, on the record. It
   * is the same principle the persona push learned: read back what landed
   * rather than trust that sending worked.
   */
  const delivery = await deliveryReport();
  if (delivery) {
    if (delivery.unreadable) {
      note(`Could not read the session tables (${delivery.unreadable}), so delivery is unverified.`);
    } else if (delivery.settled === 0) {
      note('No conversation has finished yet, so nothing here proves the webhook works.');
    } else if (delivery.missing === 0) {
      ok(`${delivery.settled} finished conversation(s), every one of them summarised`);
    } else {
      bad(
        `${delivery.missing} of ${delivery.settled} finished conversation(s) left no summary. ` +
          'Returning learners are being met as strangers.',
      );
      note('The secret can be set in both places and the webhook still never arrive:');
      note('  wrong URL, a preview deployment, switched off, or the wrong event subscribed.');
      note('In the ElevenLabs dashboard the event is `post_call_transcription`.');
      failures++;
    }
  } else {
    note('No service key here, so delivery cannot be checked locally.');
    note('/admin/estado runs the same check inside the deployment, where the key is.');
  }

  /*
   * Whether what is deployed is what is written here.
   *
   * Every other check in this file reads the repo on this machine or the agent
   * at ElevenLabs. None of them notices that the deployment is answering from an
   * older commit, which is a state this project has actually been in: a dozen
   * pushes sat undeployed while the site kept serving a build from an hour
   * earlier, and the only symptom was a page returning 404 that exists in the
   * repo and in the local build.
   *
   * Needs no secret: the origin is public and so is the commit it reports.
   */
  console.log('\nDeployed commit\n');
  let deploymentStale = false;
  const origin = configuredOrigin() ?? DEFAULT_ORIGIN;
  try {
    const res = await fetch(`${origin}/api/health`, {
      headers: { 'x-ingest-secret': process.env.INGEST_SECRET?.trim() ?? '' },
    });
    const body = (await res.json().catch(() => ({}))) as { commit?: string | null };
    const live = body.commit ?? null;
    const local = execSync('git rev-parse --short HEAD').toString().trim();

    if (!live) {
      /*
       * No commit in the answer is itself dated. This endpoint returns one
       * beside its refusal, so a deployment new enough to carry that line
       * always says which build it is, secret or no secret. Silence means the
       * build predates it, which is the same conclusion as being behind and
       * is worth stating as one rather than as a shrug.
       */
      deploymentStale = true;
      bad(`${origin} reports no commit, so it is running a build older than this check.`);
      note('Nothing pushed since then is live, including everything checked above.');
      note('Run this again in a few minutes before concluding anything: deploys here have');
      note('lagged by an hour and caught up on their own. A gap that persists is a fault.');
      failures++;
    } else if (live === local) {
      ok(`${origin} is serving ${live}, which is this checkout`);
    } else {
      const behind = execSync(`git rev-list --count ${live}..HEAD 2>/dev/null || echo ?`)
        .toString()
        .trim();
      deploymentStale = true;
      bad(`${origin} is serving ${live}; this checkout is ${local}, ${behind} commit(s) ahead.`);
      note('Nothing you have pushed since then is live, including anything checked above.');
      note('A few commits behind is usually a build still running. Check again before digging.');
      failures++;
    }
  } catch (err) {
    note(`Could not ask ${origin} which commit it is serving: ${err instanceof Error ? err.message : err}`);
  }

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
   * Every assertion below has to hold for whichever persona is live.
   *
   * The honesty rule was checked against the searching variant while the agent
   * ran the other one, and it passed on a phrase that variant does not contain.
   * The session shape and the site promises happened to survive that, which is
   * luck rather than a property: nothing stopped an edit from removing a marker
   * from one form only, and the check would have stayed green.
   *
   * So the question is asked of both. A rule that differs in wording between
   * them is satisfied when each form carries one of its phrasings, which is what
   * `satisfies` below means and why the honesty list holds phrases rather than a
   * phrase.
   */
  const personas = [teacherSystemPrompt(), teacherSystemPrompt({ search: false })];
  const inEvery = (phrase: string) => personas.every((p) => p.includes(phrase));
  const satisfies = (phrases: string[]) =>
    personas.every((p) => phrases.some((phrase) => p.includes(phrase)));

  /*
   * The persona is the product, so it gets checked like code.
   *
   * Two things rot silently here. It can lose the honesty rule in an edit and
   * keep sounding fine, right up until it invents a citation or claims to have
   * looked up a price. And the marketing page can promise a behaviour the prompt
   * no longer performs, which for a product whose central claim is "no inventa"
   * is the worst kind of drift.
   */
  /*
   * Each rule is a list of phrases, any one of which satisfies it.
   *
   * Only one rule needs that, and it needed it the moment the persona gained a
   * variant. "usa la herramienta buscar" is exactly the sentence the no-search
   * persona removes, and this check reads the searching one unconditionally, so
   * it has been reporting 6 of 6 against a persona that is not the one live on
   * the agent. The rule underneath is the same either way: do not guess about
   * something current. With a tool that means looking it up; without one it
   * means saying so and offering the general criterion instead.
   */
  const honesty: Array<[string, string[]]> = [
    ['no figures without a source', ['Nunca cifras sin fuente']],
    ['labels general knowledge', ['criterio general']],
    ['never attributes what it did not retrieve', ['Nunca atribuyas']],
    ['never promises a job', ['Nunca prometas un trabajo']],
    [
      'never guesses about live data',
      ['usa la herramienta buscar', 'tampoco ofrezcas buscarla'],
    ],
    ['never claims a search it did not run', ['nunca digas que buscaste']],
  ];
  const missingHonesty = honesty.filter(([, phrases]) => !satisfies(phrases));
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
    /*
     * The instruction, not the threshold. This matched 'menos de diez', so
     * tuning the number the rule fires at — which is a normal thing to do, and
     * was done the moment the real class length was discovered — reported the
     * session shape as incomplete. A marker anchored to a figure fails every
     * time the figure is right.
     */
    ['finishing inside the class instead of planning', 'salta el mapa'],
    ['continuity', PROMISE_MARKERS.memory],
  ];
  const missingShape = shape.filter(([, marker]) => !inEvery(marker));
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
    /*
     * Say how many, not "a lesson".
     *
     * This said adding a lesson would exceed the budget, and at 171 chars of
     * headroom that was false by a factor of four: a lesson reaches the persona
     * as "N. Título" on its own line, which is its title plus about four
     * characters, and titles here run 19 to 53. The warning was alarming past
     * the truth, which is the way a warning stops being read.
     *
     * The arithmetic is the useful part anyway. "Three more lessons" tells
     * somebody whether they are deciding or reclaiming; "will exceed it" tells
     * them to panic on a budget with room in it.
     */
    const headroom = BUDGET - persona.length;
    const longest = Math.max(...LESSONS.map((l) => l.title.length)) + 4;
    const fits = Math.floor(headroom / longest);
    note(
      `Only ${headroom} chars of headroom: room for about ${fits} more lesson title${
        fits === 1 ? '' : 's'
      }, and none of anything else.`,
    );
  } else {
    ok(`Persona is ${persona.length} chars`);
  }

  console.log('\nSite promises against persona behaviour\n');

  for (const promise of PROMISES) {
    const marker = PROMISE_MARKERS[promise.key];
    if (inEvery(marker)) ok(`"${promise.key}" is honoured by the persona`);
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
     * Listed in the order they were found, which is not the order to fix them:
     * the sections run agent-first, so "nobody can sign in" lands below a
     * missing search tool and a pricing decision sorts above a missing webhook.
     * The list is left alone, because renumbering it every run makes two runs
     * hard to compare, and `startHere` below names the one that unblocks the
     * others instead.
     */
    console.error(`\n${failed.length} check(s) failed:\n`);
    failed.forEach((m, i) => console.error(`  ${i + 1}. ${m}`));

    /*
     * Which one to do first.
     *
     * Five failures is a list, not a plan, and they are not independent: with no
     * public Supabase keys nobody can reach a page that needs an account, so
     * fixing the search tool above it changes nothing anybody can see. Ordered
     * by what the next fix makes possible, and only ever one is printed, because
     * the reason to have a first step is that it is the only one being asked
     * for.
     */
    const set = (name: string) => Boolean(process.env[name]?.trim());
    /*
     * Present is not the same as usable, and this list is about what to do
     * next, so it has to ask the same question the section above did. A URL
     * without its scheme is set, and it is also the reason nobody can sign in.
     */
    const usableUrl = (name: string) => {
      const raw = process.env[name]?.trim();
      if (!raw) return false;
      try {
        const u = new URL(raw);
        return u.protocol === 'https:' || u.protocol === 'http:';
      } catch {
        return false;
      }
    };

    /*
     * The rungs come from `setup.ts`, shared with /admin/estado, because both
     * answer this question and each had grown its own copy of the ladder. The
     * sentences stay here: this one is read in a terminal, in English, and that
     * one by an operator looking at their own product in Spanish.
     */
    const STEP_COPY: Record<string, [string, string]> = {
      signin: [
        'Set NEXT_PUBLIC_SUPABASE_URL (with https://) and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
        'Until then nobody can sign in, so nothing below it is reachable.',
      ],
      teacher: [
        'Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID.',
        'People can sign in and there is no teacher to talk to.',
      ],
      recording: [
        'Set SUPABASE_SERVICE_ROLE_KEY, and paste the migrations: `npm run sql | pbcopy`.',
        'People can sign in, and nothing they do is recorded.',
      ],
      memory: [
        'Set ELEVENLABS_WEBHOOK_SECRET and register post_call_transcription.',
        'Classes happen and are forgotten, so everyone who returns is met as a stranger.',
      ],
      search: [
        'Set INGEST_SECRET, then run `npm run setup:tools -- --push`.',
        'The teacher works; it just cannot look anything up. Its persona already says so.',
      ],
      money: [
        'Set the Stripe keys and POST /api/billing/setup.',
        'Everything teaches. Nobody can pay without you doing it by hand.',
      ],
    };

    /*
     * A stale deployment outranks every variable below it.
     *
     * The ladder asks for environment variables in the order that makes each
     * next thing observable, and all of it assumes a push becomes a build.
     * Vercel applies a variable on the following deployment, so if deployments
     * are not happening, setting one changes nothing and looks like it should
     * have. That is an hour spent on the wrong screen.
     */
    const rung = firstMissingRung((name) =>
      name === 'NEXT_PUBLIC_SUPABASE_URL' ? usableUrl(name) : set(name),
    );
    const copy = rung ? STEP_COPY[rung.id] : undefined;

    if (deploymentStale) {
      /*
       * Said the way the note under the check says it.
       *
       * This headline read "find out why the last push did not deploy", which
       * is an alarm, while the line beside the failure said a small gap is
       * usually a build still running. Both were mine and they disagreed, and
       * the headline is the one somebody acts on: it sent me looking for a
       * failed deployment on Vercel for two days when the answer was to wait.
       */
      console.error('\nStart here: check whether the last push is still building.');
      console.error('  Everything else waits on it. A variable set in Vercel applies to the');
      console.error('  next deployment, so while none has landed it changes nothing and looks');
      console.error('  like it should have. If the gap has not closed in a few minutes, then');
      console.error('  look for a failed or paused deployment.');
      if (copy) console.error(`  After that: ${copy[0]}`);
    } else if (copy) {
      console.error(`\nStart here: ${copy[0]}`);
      console.error(`  ${copy[1]}`);
    }

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
  /*
   * "Ready." on its own reads as finished, and everything above it is about
   * configuration. Nothing here has checked that a class works — only that the
   * pieces a class needs are present and agree with each other. The one thing
   * that exercises the whole chain is somebody having a complete session, and
   * the person best placed to hit a broken step and act on it is whoever runs
   * this, before anybody is sent a link.
   */
  console.log('\nReady, in the sense that nothing is misconfigured.\n');
  console.log('  Nothing above checks that a class works. Have one yourself first:');
  console.log('  a real task from your week, at a computer, through to both numbers.');
  console.log('  Then check /progreso shows the hours and /admin/embudo counts you.\n');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
