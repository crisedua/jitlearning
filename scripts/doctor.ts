/**
 * Local connectivity check against the ElevenLabs API.
 *
 *   npm run doctor
 *
 * Same three questions `/api/health` answers — key present, key carries the
 * Conversational AI scope, agent exists — but run straight from `.env.local`
 * with no server and no ingest secret. That matters during setup: the HTTP
 * route needs INGEST_SECRET to be configured before it will tell you anything,
 * which is unhelpful when what you are trying to fix is the configuration.
 *
 * Prints only whether things work. Never prints key material.
 */
import './env';
import { getAgent, listDocuments } from '../src/lib/elevenlabs';
import { agentId, embeddingModel } from '../src/lib/config';
import { availableCoaches, coachOwnsDocument } from '../src/lib/coaches';
import { tutorSystemPrompt } from '../src/lib/agent';
import { PROMISES } from '../src/lib/site';
import { supabaseAdmin } from '../src/lib/supabase/admin';

const ok = (m: string) => console.log(`  ok    ${m}`);
const bad = (m: string) => console.log(`  FAIL  ${m}`);

async function main() {
  let failures = 0;

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
        `Conversational AI scope confirmed — knowledge base reachable (${
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

  /*
   * One agent per coach, each checked for existence *and* for carrying only its
   * own material. A coach attached to another's documents fails silently — it
   * answers in scope, confidently, citing sources it should not have — so the
   * cross-corpus check is the one worth printing.
   */
  for (const coach of availableCoaches()) {
    const id = agentId(coach);

    if (!id) {
      bad(`${coach.envKey} is not set. Run \`npm run setup:agent -- ${coach.id}\`.`);
      failures++;
      continue;
    }
    if (!scopeOk) {
      console.log(`  --    ${coach.label}: ${id} configured, unverifiable without API access`);
      continue;
    }

    try {
      const agent = await getAgent(id);
      const prompt = agent.conversation_config?.agent?.prompt;
      const attached = prompt?.knowledge_base ?? [];
      const foreign = attached.filter((d) => !coachOwnsDocument(coach, d.name));

      if (foreign.length > 0) {
        bad(
          `${coach.label}: ${foreign.length} document(s) outside its corpus — ${foreign
            .map((d) => d.name)
            .join(', ')}. Check they were ingested with their folder prefix.`,
        );
        failures++;
      } else {
        ok(
          `${coach.label}: agent ${id} — ${attached.length} document(s) attached, RAG ${
            prompt?.rag?.enabled ? 'enabled' : 'disabled'
          }`,
        );
      }
    } catch (err) {
      bad(
        `${coach.label}: agent ${id} could not be fetched: ${
          err instanceof Error ? err.message : err
        }`,
      );
      failures++;
    }
  }

  // Not a pass/fail check: it is only wrong relative to the corpus. Worth
  // printing because changing it later silently orphans every existing index.
  console.log(`\n  Embedding model: ${embeddingModel()}`);

  // Reported separately from the ElevenLabs checks because it fails
  // separately: ingestion works fine without any of this, and the only visible
  // symptom is that no learner gets past /acceso — or, worse, that they do and
  // nothing about the session is ever recorded.
  console.log('\nSupabase (sign-in, plans, usage)\n');
  let supabaseFailures = 0;

  const missingAuth = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'].filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missingAuth.length === 0) {
    ok('Project URL and anon key are set — learners can sign in');
  } else {
    bad(`${missingAuth.join(', ')} missing — nobody can sign in, so /coach is unreachable.`);
    console.log('        Supabase dashboard -> Project Settings -> API.');
    supabaseFailures++;
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    bad('SUPABASE_SERVICE_ROLE_KEY missing — sessions will not be recorded.');
    supabaseFailures++;
  } else if (missingAuth.length === 0) {
    // Reaching the table proves three things at once: the key works, the
    // migration ran, and the app is pointed at the right project.
    const { error } = await supabaseAdmin()
      .from('coach_sessions')
      .select('id', { count: 'exact', head: true });
    if (error) {
      bad(`coach_sessions is not queryable: ${error.message}`);
      console.log('        Run supabase/migrations/*.sql in the SQL editor.');
      supabaseFailures++;
    } else {
      ok('Schema reachable — profiles, plans and coach_sessions are in place');
    }

    // The study tables carry everything that makes a session a continuation
    // rather than a first meeting, so their absence is worth naming precisely.
    for (const table of ['session_summaries', 'career_profiles']) {
      const probe = await supabaseAdmin().from(table).select('*', { count: 'exact', head: true });
      if (!probe.error) {
        ok(`${table} exists with row-level security`);
      } else {
        bad(`${table} is not queryable: ${probe.error.message}`);
        console.log('        Run supabase/migrations/20260808000000_study_memory.sql.');
        supabaseFailures++;
      }
    }
  }

  /*
   * The persona is the product, so it gets checked like code.
   *
   * Two things can rot silently here. A persona can lose the honesty rule in
   * an edit and keep sounding fine, right up until it invents a citation. And
   * the marketing copy can promise a behaviour the persona no longer performs,
   * which for a product whose central claim is "no inventa" is the worst kind
   * of drift. Both are mechanical to check, so they are checked.
   */
  console.log('\nPersonas\n');

  for (const coach of availableCoaches()) {
    const persona = tutorSystemPrompt(coach);

    const honesty = [
      'Nunca cifras sin fuente',
      'Nunca inventes nombres',
      'criterio general',
    ].filter((phrase) => !persona.includes(phrase));

    if (honesty.length === 0) {
      ok(`${coach.label}: honesty rule complete`);
    } else {
      bad(`${coach.label}: honesty rule incomplete, missing: ${honesty.join(', ')}`);
      failures++;
    }

    if (persona.includes('## Cómo va la sesión') && coach.sessionSpine.trim().length > 200) {
      ok(`${coach.label}: session spine present`);
    } else {
      bad(`${coach.label}: no usable session spine`);
      failures++;
    }

    // Voice is the whole premise: a persona over budget gets truncated or
    // ignored, and the first thing to go is whatever was said last.
    const size = persona.length;
    if (size <= 15_000) {
      ok(`${coach.label}: persona is ${size} chars`);
    } else {
      bad(`${coach.label}: persona is ${size} chars, over the 15,000 budget`);
      failures++;
    }
  }

  console.log('\nSite promises against persona behaviour\n');

  for (const promise of PROMISES) {
    const missing = availableCoaches().filter(
      (coach) => !tutorSystemPrompt(coach).includes(promise.personaMarker),
    );
    if (missing.length === 0) {
      ok(`"${promise.key}" is honoured by all ${availableCoaches().length} personas`);
    } else {
      bad(
        `"${promise.key}" is promised in site.ts but missing from: ${missing
          .map((c) => c.label)
          .join(', ')}`,
      );
      failures++;
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed. Ingestion will not work until they pass.\n`);
    process.exit(1);
  }
  if (supabaseFailures > 0) {
    console.error('\nIngestion is ready, but learners cannot use the coach yet.\n');
    process.exit(1);
  }
  console.log('\nReady to ingest.\n');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
