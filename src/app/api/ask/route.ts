/**
 * The teacher's lookup, as a server tool.
 *
 * ElevenLabs calls this mid-conversation when the agent decides it needs
 * something it cannot know: a current price, what employers in a field are
 * asking for, whether a product still works the way it described. The answer
 * comes back shaped for voice, with the sources the search actually returned.
 *
 * A *server* tool, not a client one: ElevenLabs calls the deployed app directly,
 * so the browser is never in the loop and a session started from anywhere gets
 * the same answer. Register it with `npm run setup:tools -- --push`.
 *
 * ## Why this is gated
 *
 * This route spends money on every call — an Opus 5 turn plus up to 4 billed web
 * searches. Left open it is a way for anyone who finds the URL to run up an
 * Anthropic bill, so it carries the same `INGEST_SECRET` as every other
 * privileged route, sent by ElevenLabs as a static header in the tool config.
 * That header is also what made gating `/api/pain-search` cheap: the trade this
 * route already makes and accepts was the one that route was left open to avoid.
 *
 * ## Latency is the real constraint
 *
 * A search-backed answer takes several seconds, which in a voice call is a long
 * silence. Two things make that acceptable: the persona announces the lookup
 * before calling ("dame unos segundos y lo busco"), and the tool's
 * `response_timeout_secs` is set well above the default. `maxDuration` here has
 * to clear the same bar, or Vercel kills the request before ElevenLabs gives up.
 */
import { NextResponse } from 'next/server';
import { consultar, consultaConfigured } from '@/lib/consulta';
import { requireSecret, UnauthorizedError } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Above the tool's own timeout, so the caller decides when to give up, not Vercel. */
export const maxDuration = 60;

/** Long enough for a real question, short enough that nobody pastes an essay into a billed call. */
const MAX_QUESTION = 300;
const MAX_PROFILE = 300;

export async function GET(req: Request) {
  try {
    requireSecret(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  if (!consultaConfigured()) {
    return NextResponse.json(
      {
        // Written to be said out loud: whatever this route returns, the teacher
        // reads it to a person who is waiting. An error here is still a turn in
        // a conversation, so it gets a sentence rather than a status code.
        respuesta:
          'No puedo buscar en internet en este momento. Dime qué necesitas saber y seguimos con lo que sí puedo enseñarte.',
        fuentes: [],
      },
      { status: 200 },
    );
  }

  const params = new URL(req.url).searchParams;
  const question = (params.get('q') ?? '').trim().slice(0, MAX_QUESTION);
  const profile = (params.get('perfil') ?? '').trim().slice(0, MAX_PROFILE) || undefined;

  if (!question) {
    return NextResponse.json(
      {
        respuesta: 'No me llegó la pregunta. Repítemela y la busco.',
        fuentes: [],
      },
      { status: 200 },
    );
  }

  try {
    const result = await consultar(question, profile);

    if (result.refusal) {
      return NextResponse.json({
        respuesta:
          'Eso no lo puedo buscar. Si quieres, dime qué parte te sirve para tu trabajo y lo vemos desde ahí.',
        fuentes: [],
      });
    }

    if (!result.answer) {
      return NextResponse.json({
        respuesta: 'Busqué y no encontré nada firme. Prefiero decírtelo antes que inventarlo.',
        fuentes: [],
      });
    }

    /*
     * Spanish keys, because the agent reads them.
     *
     * The model on the other side of this tool is being asked to speak from the
     * result, so the field it should say out loud is called `respuesta` and the
     * one it must not read aloud is called `fuentes`. Naming them in the
     * language of the conversation costs nothing and removes one translation
     * step from the agent's turn.
     */
    return NextResponse.json({
      respuesta: result.answer,
      // Titles only. The URLs are deliberately not here: the agent would try to
      // say them, and a URL read aloud is noise. They live in the notebook.
      fuentes: result.sources.map((s) => s.title),
      busquedas: result.searches,
    });
  } catch (err) {
    console.error('[ask] lookup failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({
      respuesta:
        'La búsqueda falló. Sigamos con la clase y lo dejamos anotado para revisarlo tú mismo.',
      fuentes: [],
    });
  }
}
