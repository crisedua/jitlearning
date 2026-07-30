/**
 * Configuration diagnostics.
 *
 * Answers "is this deployment actually wired up?" in one call: which
 * environment variables are present, whether the ElevenLabs key authenticates,
 * whether it carries the Conversational AI scope, and whether the agent exists.
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
import { requireSecret, UnauthorizedError } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

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

  // 3. Is the agent configured, and does it actually exist?
  const id = agentId();
  if (!id) {
    checks.agent = {
      state: 'fail',
      detail: 'ELEVENLABS_AGENT_ID is not set. POST /api/agent/provision to create one.',
    };
  } else if (checks.convaiAccess.state !== 'ok') {
    checks.agent = { state: 'skipped', detail: `Set to ${id}, but cannot verify without API access` };
  } else {
    try {
      const agent = await getAgent(id);
      const prompt = agent.conversation_config?.agent?.prompt;
      checks.agent = {
        state: 'ok',
        detail: `Agent ${id} exists · ${prompt?.knowledge_base?.length ?? 0} document(s) attached · RAG ${prompt?.rag?.enabled ? 'enabled' : 'disabled'}`,
      };
    } catch (err) {
      checks.agent = {
        state: 'fail',
        detail: `ELEVENLABS_AGENT_ID=${id} is set but the agent could not be fetched: ${
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

  const ready = Object.values(checks).every((c) => c.state === 'ok');

  return NextResponse.json(
    { ready, embeddingModel: embeddingModel(), checks },
    { status: ready ? 200 : 503 },
  );
}
