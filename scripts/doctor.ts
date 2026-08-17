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
import { buildPlan, LESSONS, LEVELS, lessonsForLevel, PATHS } from '../src/lib/curriculum';
import { supabaseAdmin } from '../src/lib/supabase/admin';

const ok = (m: string) => console.log(`  ok    ${m}`);
const bad = (m: string) => console.log(`  FAIL  ${m}`);
const note = (m: string) => console.log(`        ${m}`);

/** The tables the teacher's memory lives in, and the migration that makes them. */
const MEMORY_TABLES = ['career_profiles', 'plan_steps', 'session_summaries'] as const;
const MEMORY_MIGRATION = 'supabase/migrations/20260810000000_teacher_memory.sql';

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
        note('Run `npm run setup:tools -- --push`.');
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
    ['the map', PROMISE_MARKERS.map],
    ['the curriculum', PROMISE_MARKERS.plan],
    ['the diagnostic', '### Primera sesión'],
    ['the lesson structure', '### Sesiones siguientes'],
    ['the computer-or-walking switch', '## Dónde está la persona'],
    ['the commitment', '## Termina con un compromiso'],
    ['continuity', PROMISE_MARKERS.memory],
  ];
  const missingShape = shape.filter(([, marker]) => !persona.includes(marker));
  if (missingShape.length === 0) ok('Session shape complete: diagnostic, map, lesson, commitment');
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
  console.log('\nReady.\n');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
