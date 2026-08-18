/**
 * Configuration diagnostics.
 *
 * Answers "is this deployment actually wired up?" in one call, in two parts.
 *
 * `ready` is the learner path: somebody can sign in, have a class with the
 * teacher this repo describes, and have it recorded. That last clause is the one
 * that grew — it used to mean only that an agent existed, so `ready: true` was
 * returned by deployments whose agent ran a persona several pushes old, opened
 * with a fixed greeting instead of the learner's own record, and promised a
 * search with no tool attached. All three are invisible from the repo and none
 * of them errors.
 *
 * `selling` is the payment path, kept separate on purpose. A deployment with no
 * Stripe keys falls back to writing to a person, which is supported rather than
 * broken, so folding it into `ready` would make one boolean either false for a
 * working product that is not selling yet, or true for one that takes money and
 * grants nothing.
 *
 *   curl -X GET https://<app>.vercel.app/api/health \
 *     -H "x-ingest-secret: $INGEST_SECRET"
 *
 * Secret-gated: it reports on configuration, which is not public information.
 * Never returns key material — only whether things work.
 */
import { NextResponse } from 'next/server';
import { getAgent, listDocuments } from '@/lib/elevenlabs';
import { agentId, embeddingModel } from '@/lib/config';
import { ownsDocument, TEACHER } from '@/lib/teacher';
import { FIRST_MESSAGE, teacherSystemPrompt } from '@/lib/agent';
import { requireSecret, UnauthorizedError } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { MIGRATION_SENSITIVE } from '@/lib/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CheckState = 'ok' | 'fail' | 'skipped';

interface Check {
  state: CheckState;
  detail: string;
}

export async function GET(req: Request) {
  try {
    requireSecret(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const checks: Record<string, Check> = {};

  // 1. Is the key present at all?
  const hasKey = Boolean(process.env.ELEVENLABS_API_KEY);
  checks.apiKeyPresent = hasKey
    ? { state: 'ok', detail: 'ELEVENLABS_API_KEY is set' }
    : { state: 'fail', detail: 'ELEVENLABS_API_KEY is missing from the environment' };

  // 2. Does it authenticate and carry the convai scope? Listing the knowledge
  //    base exercises exactly the permission this app needs.
  if (hasKey) {
    try {
      const { documents } = await listDocuments({ pageSize: 1 });
      checks.convaiAccess = {
        state: 'ok',
        detail: `Conversational AI scope confirmed (knowledge base reachable, ${documents.length > 0 ? 'has documents' : 'currently empty'})`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      checks.convaiAccess = {
        state: 'fail',
        detail: /missing the permission/.test(message)
          ? 'Key authenticates but lacks the Conversational AI scope. Enable convai read+write on the key.'
          : message,
      };
    }
  } else {
    checks.convaiAccess = { state: 'skipped', detail: 'No API key to test' };
  }

  /*
   * 3. Is the agent configured, does it exist, and is it carrying only the live
   *    corpus?
   *
   * That last part is the one worth having here. An agent still attached to a
   * retired corpus is not a visible failure — it answers confidently, citing
   * material nobody maintains — so nothing surfaces it except a check that
   * compares the attachment list against `TEACHER.sources`. The usual cause is a
   * document ingested without its folder prefix.
   */
  const id = agentId();
  if (!id) {
    checks.agent = {
      state: 'fail',
      detail: `${TEACHER.envKey} is not set. POST /api/agent/provision to create one.`,
    };
  } else if (checks.convaiAccess.state !== 'ok') {
    checks.agent = {
      state: 'skipped',
      detail: `Set to ${id}, but cannot verify without API access`,
    };
  } else {
    try {
      const agent = await getAgent(id);
      const prompt = agent.conversation_config?.agent?.prompt;
      const attached = prompt?.knowledge_base ?? [];
      const foreign = attached.filter((d) => !ownsDocument(d.name));

      /*
       * The three things that decide whether the teacher behaves as designed.
       *
       * All of them live on the agent, none of them is visible from the repo,
       * and each fails silently: a persona a push behind runs old instructions,
       * a fixed first message means nobody hears their own commitment, and an
       * unattached tool means the teacher announces a search it cannot make —
       * because the persona promises one.
       *
       * `ready` counted six checks and none of these, so it could be true of a
       * deployment where every learner met an older teacher.
       */
      const live = (prompt?.prompt ?? '').trim();
      checks.persona =
        live === teacherSystemPrompt().trim()
          ? { state: 'ok', detail: "The live agent runs this repo's persona, character for character" }
          : {
              state: 'fail',
              detail: `The agent's persona differs from this deployment's code (${live.length} chars live). Run \`npm run sync:agent -- --push\`.`,
            };

      const first = (agent.conversation_config?.agent?.first_message ?? '').trim();
      checks.opening =
        first === FIRST_MESSAGE
          ? { state: 'ok', detail: 'Sessions open on the learner\'s own record' }
          : {
              state: 'fail',
              detail: `The agent opens with ${first ? `"${first}"` : 'nothing'} instead of ${FIRST_MESSAGE}, so nobody hears their own commitment.`,
            };

      const tools = prompt?.tool_ids ?? [];
      checks.lookupTool =
        tools.length > 0
          ? { state: 'ok', detail: `${tools.length} tool(s) attached, including the lookup the persona promises` }
          : {
              state: 'fail',
              detail:
                'No tools attached while the persona tells learners it can search. Needs INGEST_SECRET deployed, then `npm run setup:tools -- --push`.',
            };

      checks.agent =
        foreign.length > 0
          ? {
              state: 'fail',
              detail: `Agent ${id} carries ${foreign.length} document(s) outside the live corpus: ${foreign
                .map((d) => d.name)
                .join(', ')}. Re-run the sync, and check they were ingested with their folder prefix.`,
            }
          : {
              state: 'ok',
              detail: `Agent ${id} exists · ${attached.length} document(s) attached, all within ${TEACHER.sources.join(', ')} · RAG ${prompt?.rag?.enabled ? 'enabled' : 'disabled'}`,
            };
    } catch (err) {
      checks.agent = {
        state: 'fail',
        detail: `${TEACHER.envKey}=${id} is set but the agent could not be fetched: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
  }

  // 4. Can a learner actually sign in? Missing Supabase config does not break
  //    anything visibly until someone clicks the button and lands on an error,
  //    which is exactly the kind of failure this endpoint exists to surface.
  const missingAuth = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'].filter(
    (name) => !process.env[name],
  );
  checks.signIn =
    missingAuth.length === 0
      ? { state: 'ok', detail: 'Supabase sign-in configured; /coach is reachable by learners' }
      : {
          state: 'fail',
          detail: `Missing ${missingAuth.join(', ')}. Nobody can sign in, so /coach is unreachable.`,
        };

  // 5. Is the schema reachable with the service role? Without it sign-in still
  //    works and the coach still talks — every session just goes unrecorded,
  //    which is the kind of failure nobody notices until the month's numbers
  //    are needed.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    checks.usageLedger = {
      state: 'fail',
      detail: 'SUPABASE_SERVICE_ROLE_KEY is missing. Sessions will not be recorded.',
    };
  } else if (missingAuth.length > 0) {
    checks.usageLedger = { state: 'skipped', detail: 'No Supabase URL to test against' };
  } else {
    const { error } = await supabaseAdmin()
      .from('coach_sessions')
      .select('id', { count: 'exact', head: true });
    checks.usageLedger = error
      ? {
          state: 'fail',
          detail: `coach_sessions is not queryable: ${error.message}. Run the migration in supabase/migrations/.`,
        }
      : { state: 'ok', detail: 'Supabase schema reachable; sessions are being recorded' };
  }

  /*
   * 6. Did the migrations actually run *here*?
   *
   * `npm run doctor` asks this too, and asks it of whatever `.env.local` points
   * at, which is a laptop's idea of the world. Twice in this project the local
   * picture and the deployed one have disagreed, and both times the deployment
   * was the broken one. This endpoint runs inside the deployment, so it is the
   * only thing that can answer for it.
   *
   * Each entry names a column rather than just a table, because the failures
   * that have actually happened here were columns: a missing `handled_at` turns
   * a failed payment into a permanent one, a missing `plan_granted_until` makes
   * every comped plan last forever. A `select` of the column returns 42P01 for a
   * missing table and 42703 for a missing column, and both mean the same thing
   * to the reader: run the SQL.
   */

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || missingAuth.length > 0) {
    checks.schema = { state: 'skipped', detail: 'No service role to inspect the schema with' };
  } else {
    const broken: string[] = [];
    for (const { table, column, why } of MIGRATION_SENSITIVE) {
      const { error } = await supabaseAdmin()
        .from(table)
        .select(column, { count: 'exact', head: true });
      if (error) broken.push(`${table}.${column} (${why}): ${error.code ?? error.message}`);
    }

    checks.schema =
      broken.length === 0
        ? {
            state: 'ok',
            detail: `All ${MIGRATION_SENSITIVE.length} migration-sensitive columns present`,
          }
        : {
            state: 'fail',
            detail: `Run \`npm run sql\` against this project. Missing: ${broken.join('; ')}`,
          };
  }

  /*
   * Two verdicts, because they answer different questions.
   *
   * `ready` is about the learner path: can somebody sign in, have a class with
   * the teacher this repo describes, and have it recorded. `selling` is about
   * the payment path, and it is deliberately not part of `ready` — a deployment
   * with no Stripe keys falls back to writing to a person, which is a supported
   * state and not a broken one.
   *
   * One boolean covering both would have to be false for a deployment that
   * works perfectly and is not selling yet, or true for one that takes money and
   * grants nothing. Neither is a useful answer.
   */
  const ready = Object.values(checks).every((c) => c.state === 'ok');
  const selling = Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_WEBHOOK_SECRET?.trim(),
  );

  return NextResponse.json(
    {
      ready,
      selling,
      sellingDetail: selling
        ? 'Stripe is configured; a completed payment can grant a plan.'
        : 'No Stripe keys: paid plans fall back to writing to a person. Not counted against `ready`.',
      embeddingModel: embeddingModel(),
      checks,
    },
    { status: ready ? 200 : 503 },
  );
}
