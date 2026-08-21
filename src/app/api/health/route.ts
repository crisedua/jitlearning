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
import { getAgent, listDocuments, listTools } from '@/lib/elevenlabs';
import { agentId, embeddingModel } from '@/lib/config';
import { ownsDocument, TEACHER } from '@/lib/teacher';
import { FIRST_MESSAGE, LOOKUP_TOOL_NAME, teacherSystemPrompt } from '@/lib/agent';
import { requireSecret, UnauthorizedError } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { MIGRATION_SENSITIVE } from '@/lib/schema';
import { openrouterConfigured } from '@/lib/openrouter';
import { PRACTICE_MODELS, SANDBOX_TOOL } from '@/lib/practica';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CheckState = 'ok' | 'fail' | 'skipped';

interface Check {
  state: CheckState;
  detail: string;
}

/**
 * The commit this build came from, which is not a secret.
 *
 * Vercel sets it in the runtime environment. Absent means either not deployed
 * there or a build older than this line, and both answers are useful.
 */
const commit = () => process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;

export async function GET(req: Request) {
  try {
    requireSecret(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      /*
       * The commit rides along with the refusal.
       *
       * Everything else here is a description of how this deployment is
       * configured and stays behind the secret. A seven character hash of a
       * public repository is not, and withholding it makes the one question
       * somebody asks during an outage unanswerable: is the thing I pushed the
       * thing that is running.
       *
       * Yesterday's check could not tell "the deployment is old" from "the
       * secret is not set there", because both produced a body with no commit
       * in it. Those are opposite conclusions — one says look at Vercel, the
       * other says look at your environment variables — and it reported the
       * first for the second.
       */
      return NextResponse.json({ error: err.message, commit: commit() }, { status: err.status });
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
        /*
         * Either variant counts as matching. The persona is pushed with or
         * without its lookup promise depending on whether a tool is attached
         * (see `teacherSystemPrompt`), so comparing against only the searching
         * one would report drift on a correctly synced agent that has no tool.
         */
        live === teacherSystemPrompt().trim() ||
        live === teacherSystemPrompt({ search: false }).trim()
          ? {
              state: 'ok',
              detail:
                live === teacherSystemPrompt({ search: false }).trim()
                  ? "The live agent runs this repo's persona, without the lookup promise it cannot keep"
                  : "The live agent runs this repo's persona, character for character",
            }
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

      /*
       * Which tools, not how many.
       *
       * This counted `tool_ids` and called any non-empty list "the lookup the
       * persona promises", which was true while there was one tool and stopped
       * being true the moment the sandbox tool existed: an agent carrying only
       * `open_model_sandbox` would have reported a healthy search it cannot
       * make. Ids are opaque, so the names have to be fetched.
       */
      const toolIds = prompt?.tool_ids ?? [];
      let attachedNames: string[] = [];
      try {
        const byId = new Map((await listTools()).tools.map((t) => [t.id, t.tool_config?.name]));
        attachedNames = toolIds.map((id) => byId.get(id) ?? id);
      } catch {
        attachedNames = toolIds;
      }

      checks.lookupTool = attachedNames.includes(LOOKUP_TOOL_NAME)
        ? { state: 'ok', detail: `\`${LOOKUP_TOOL_NAME}\` is attached, so the teacher can look things up` }
        : {
            state: 'fail',
            detail: `No \`${LOOKUP_TOOL_NAME}\` tool attached${
              attachedNames.length ? ` (found: ${attachedNames.join(', ')})` : ''
            }. Needs INGEST_SECRET deployed, then \`npm run setup:tools -- --push\`.`,
          };

      /*
       * The sandbox tool is the only way the practice panel ever opens: it is
       * gated on the teacher calling it, so an agent without it has a bench no
       * learner can reach and a teacher that will keep offering one.
       *
       * A failure rather than a note, but only where the bench is switched on.
       * A deployment with no OpenRouter key has no panel to open and should not
       * be told it is missing the key to a door it does not have.
       */
      if (openrouterConfigured()) {
        checks.sandboxTool = attachedNames.includes(SANDBOX_TOOL.name)
          ? {
              state: 'ok',
              detail: `\`${SANDBOX_TOOL.name}\` is attached, so the teacher can open the practice bench`,
            }
          : {
              state: 'fail',
              detail: `The bench is on and \`${SANDBOX_TOOL.name}\` is not attached, so nothing can open it. Run \`npm run setup:tools -- --push\`.`,
            };
      }

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
   * 5b. Are the classes that happened actually reaching the notebook?
   *
   * The check above proves `coach_sessions` is queryable, and then says
   * "sessions are being recorded", which is a different claim and was the one
   * that turned out to be false. A learner reported a class that left no trace,
   * and every check here was green while it happened: the agent was right, the
   * persona matched, the tools were attached, the schema was complete, the
   * webhook was registered in ElevenLabs. Nothing looked at the outcome.
   *
   * `conversation_id` is the whole story. It is the only key the post-call
   * webhook can match a transcript on, and the only key `sync:usage` can
   * reconcile a row on. A finished class with a null there is unrecoverable by
   * either path — the transcript is dropped with a 200 and the row stays an
   * estimate forever — and the learner is told their class was not saved.
   *
   * So this counts exactly that: classes old enough to be over, with no id.
   *
   * Age is the filter, not `ended_at`, and the first version of this check got
   * that wrong. It asked for rows where `ended_at` was set and the id was null,
   * which cannot catch the failure it was written for: the report that stamps
   * `ended_at` is the same report that carries the id, so a lost one leaves
   * both columns null and the row slips past. Shipped green against a
   * deployment that had just lost somebody's class.
   *
   * A class is capped at CLASS_CAP_MINUTES, so anything that started an hour
   * ago and still has no id is finished and unrecoverable, however it ended.
   * A handful is normal — opening the page and closing it before the call
   * connects leaves a row with nothing to report. A run of them is the failure
   * this exists to name out loud, rather than leaving it to whoever reads a
   * WhatsApp message weeks later.
   */
  if (checks.usageLedger.state === 'ok') {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000).toISOString();
    const settled = new Date(Date.now() - 60 * 60 * 1_000).toISOString();
    const { data, error } = await supabaseAdmin()
      .from('coach_sessions')
      .select('id')
      .gte('started_at', since)
      .lt('started_at', settled)
      .is('conversation_id', null)
      .limit(50);

    const orphaned = data?.length ?? 0;
    checks.classesSaved = error
      ? { state: 'fail', detail: `could not count unsaved classes: ${error.message}` }
      : orphaned === 0
        ? { state: 'ok', detail: 'Every class in the last 7 days carries the id its summary needs' }
        : {
            state: 'fail',
            detail: `${orphaned} class(es) in the last 7 days have no conversation_id, so their transcripts were dropped and sync:usage cannot recover them.`,
          };
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
      /*
       * `limit(0)`, not `head: true`.
       *
       * `head` sends a HEAD request, and a HEAD response carries no body by
       * definition — so when PostgREST refused, supabase-js had nothing to
       * parse and handed back `{ message: '' }`. This check reported four
       * columns missing and could not say why about any of them, and it could
       * never have: the reason was discarded by the shape of the request, not
       * lost by the formatting. Two rounds of widening the message chased a
       * value that was never going to be there.
       *
       * A `limit(0)` select is the same question with a readable answer: no
       * rows come back either way, and a failure arrives as an ordinary
       * PostgREST error — 42703 for a missing column, 42P01 for a missing
       * table — with a sentence attached. `status` rides along for the
       * failures that never reach PostgREST at all.
       */
      const { error, status } = await supabaseAdmin().from(table).select(column).limit(0);
      if (error) {
        /*
         * `||`, not `??`.
         *
         * PostgREST hands back an error object whose `code` can be the empty
         * string, and `'' ?? x` is `''` — so this printed "plan_steps.minutes_before
         * (no plan, and nothing to measure): " with nothing after the colon, on
         * the one check whose entire job is to say what is wrong. Four columns
         * were reported missing and not one of them said why.
         *
         * Both fields go out now. The code is what a search engine answers
         * (42703 is a missing column, 42P01 a missing table) and the message is
         * what a person reads.
         */
        /*
         * Every field, because the obvious two came back empty.
         *
         * `code ?? message` printed nothing, so it was widened to `code ||
         * message` — and that printed "no reason given", which means both are
         * empty on an error object that is nonetheless truthy. A check that
         * reports four missing columns and cannot say why about any of them is
         * not evidence of anything, and acting on it means running migrations
         * to fix a problem nobody has confirmed exists.
         *
         * PostgrestError carries `details` and `hint` as well, and a failure
         * that is not from PostgREST at all (a fetch that threw, a gateway
         * answering HTML) has a `name` and little else. All of it goes out.
         */
        const parts = [error.code, error.message, error.details, error.hint]
          .filter((v) => typeof v === 'string' && v.length > 0)
          .join(' | ');
        broken.push(`${table}.${column} (${why}): ${parts || `HTTP ${status}`}`);
      }
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
  /*
   * The practice bench, reported the way `selling` is and for the same reason.
   *
   * Off is a supported state, not a broken one: with no OpenRouter key the
   * panel does not render, `/api/practica` answers with a sentence saying so,
   * and the class runs by voice exactly as it did before. Folding that into
   * `ready` would make a working deployment report itself broken for declining
   * an optional feature.
   *
   * What is *not* reported here is whether the bench is metered, and that is
   * deliberate: `practice_messages.billed_seconds` is in MIGRATION_SENSITIVE, so
   * a deployment running the bench without its ledger fails `checks.schema` and
   * takes `ready` down with it. That is the right severity — it is the state
   * where every message is served and none is charged.
   *
   * `npm run doctor` asks the same question of `.env.local`, which on a
   * Vercel-only deployment is always going to answer "off" about a bench that is
   * on. This runs inside the deployment, so it is the one that can be believed.
   */
  const bench = openrouterConfigured();

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
      bench,
      benchDetail: bench
        ? `Practice bench is on: ${PRACTICE_MODELS.map((m) => `${m.label} (${m.model})`).join(', ')}. Metering is covered by \`checks.schema\`.`
        : 'No OPENROUTER_API_KEY: the bench does not render and the class runs by voice. Not counted against `ready`.',
      embeddingModel: embeddingModel(),
      /*
       * Which commit is answering.
       *
       * There was no way to tell from outside, and that turned out to matter:
       * a run of pushes sat undeployed for a dozen commits while every check
       * here reported on the old build, correctly and uselessly. The doctor
       * compares this to the local HEAD, so "is my change live" stops being
       * answered by opening the site and looking for a sentence.
       *
       * Vercel sets this in the runtime environment. Locally it is absent, and
       * absent is honest: nothing has been deployed.
       */
      commit: commit(),
      checks,
    },
    { status: ready ? 200 : 503 },
  );
}
