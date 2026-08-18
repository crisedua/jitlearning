/**
 * Run the LLM radar from the browser.
 *
 * Same shape as `pain-seed` — admin-gated, service-role write, Spanish
 * errors — with one difference that shapes everything: the run inside takes
 * one to three minutes (six LLM calls, five parallel scans and one curation,
 * with roughly 40 to 70 real web searches between them and a URL check per
 * finding), so the route declares `maxDuration = 300` and the button warns
 * about the wait.
 *
 * A single awaited request rather than fire-and-forget on purpose: a
 * serverless function may be frozen the moment the response is sent, so
 * "kicks off and writes later" is a promise this platform does not make. The
 * store runs after both stages, which means a timeout kills the run with no
 * partial writes — cleanly retryable.
 */
import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/admin';
import { openaiConfigured } from '@/lib/openai';
import { runRadarLlm, RADAR_SCOPES, type RadarScope } from '@/lib/radar-llm';
import { storePainSignals } from '@/lib/pains-store';
import { serviceConfigured } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  const admin = await checkAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      {
        error:
          admin.reason === 'anonymous'
            ? 'Inicia sesión para usar el radar.'
            : 'Esta acción es solo para el operador.',
      },
      { status: admin.reason === 'anonymous' ? 401 : 403 },
    );
  }

  if (!serviceConfigured()) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY no está configurada en este despliegue.' },
      { status: 503 },
    );
  }
  if (!openaiConfigured()) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY no está configurada en este despliegue.' },
      { status: 503 },
    );
  }

  let scope: RadarScope = 'all';
  try {
    const body = (await req.json()) as { scope?: string };
    if (body.scope && body.scope in RADAR_SCOPES) scope = body.scope as RadarScope;
  } catch {
    // No body: default scope.
  }

  try {
    const result = await runRadarLlm({ scope });
    const { stored, error } = await storePainSignals(result.signals);
    if (error) return NextResponse.json({ error }, { status: 500 });

    return NextResponse.json({
      ok: true,
      stored,
      dropped: result.dropped,
      costoUsd: Number(result.usage.estimatedUsd.toFixed(2)),
      notas: result.notes,
    });
  } catch (err) {
    console.error('[pain-radar] run failed:', err);
    return NextResponse.json(
      { error: 'La búsqueda falló a mitad de camino. No se escribió nada; vuelve a intentarlo.' },
      { status: 500 },
    );
  }
}
