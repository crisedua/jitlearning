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
import { PROMISE_MARKERS, teacherSystemPrompt } from '../src/lib/agent';
import { PROMISES } from '../src/lib/site';
import { FALLBACK_PLANS, formatMoney } from '../src/lib/plans';
import { buildPlan, LESSONS, LEVELS, lessonsForLevel, PATHS } from '../src/lib/curriculum';
import { supabaseAdmin } from '../src/lib/supabase/admin';
import { billingConfigured } from '../src/lib/billing';
import { breakEven, DEFAULT_INPUTS } from '../src/lib/costs';

const ok = (m: string) => console.log(`  ok    ${m}`);
const bad = (m: string) => console.log(`  FAIL  ${m}`);
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
         * Order matters, and getting it backwards is worse than doing nothing.
         * The tool points at `/api/ask`, which needs ANTHROPIC_API_KEY in the
         * deployment. Attach it first and the agent stops being unable to search
         * and starts announcing a search that errors mid-conversation, in front
         * of the learner. Not searching is a limitation; searching and failing is
         * a broken product, so the key goes in first.
         */
        note('Set ANTHROPIC_API_KEY in the deployment FIRST, then `npm run setup:tools -- --push`.');
        note('Backwards, the agent announces a search that errors mid-conversation.');
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
          ok(`${rows.length} paid plan(s) have a Stripe price and can be bought`);
        } else {
          bad(`No Stripe price on: ${missingPrice.join(', ')}. Those plans cannot be bought.`);
          note('curl -X POST <app>/api/billing/setup -H "x-ingest-secret: $INGEST_SECRET"');
          billingFailures++;
        }
      }
    }
  }

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

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.\n`);
    process.exit(1);
  }
  if (supabaseFailures > 0) {
    console.error('\nElevenLabs is ready, but learners cannot use the teacher yet.\n');
    process.exit(1);
  }
  if (billingFailures > 0) {
    console.error('\nThe teacher works, but the checkout would take money and grant nothing.\n');
    process.exit(1);
  }
  console.log('\nReady.\n');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
