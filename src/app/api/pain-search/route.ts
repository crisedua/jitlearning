/**
 * What people are complaining about, searchable by the coach mid-conversation.
 *
 * This is an ElevenLabs *server tool*: the agent calls it during a call, so the
 * budget is a second or two, not the forty-odd seconds an Apify run takes. That
 * is the whole reason the sweep is offline — `npm run scrape:pains` fills the
 * table ahead of time and this route only reads it.
 *
 * Open on purpose, and read-only. Every row is an excerpt of a public forum
 * post that already carries a public URL, so there is nothing here to protect;
 * a shared secret sitting in a third-party tool config would be a worse trade
 * than the thing it guarded. Row-level security exposes only `published` rows,
 * and the anon key cannot write, so the worst an unexpected caller can do is
 * read curated public quotes.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { anonKey, authConfigured, supabaseUrl } from '@/lib/supabase/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Enough to answer with, few enough to say out loud. */
const LIMIT = 5;

/** Two-letter codes the sweep actually tags rows with. */
const COUNTRIES = new Set(['CL', 'AR', 'MX', 'ES', 'UY', 'CO', 'PE', 'BO']);

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = (params.get('q') ?? '').trim().slice(0, 120);
  const countryRaw = (params.get('pais') ?? params.get('country') ?? '').trim().toUpperCase();
  const country = COUNTRIES.has(countryRaw) ? countryRaw : null;

  if (!q) {
    return NextResponse.json(
      { error: 'Falta el tema a buscar. Pasa un rubro o una palabra clave en `q`.' },
      { status: 400 },
    );
  }

  if (!authConfigured()) {
    return NextResponse.json({
      results: [],
      note: 'El buscador de dolores no está configurado en este despliegue.',
    });
  }

  try {
    const supabase = createClient(supabaseUrl(), anonKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    /*
     * `websearch` parsing rather than `plain`: the coach passes whatever the
     * learner said ("cobros a clientes que no pagan"), and websearch mode
     * treats that as terms to AND rather than as one literal phrase that would
     * match nothing.
     */
    let query = supabase
      .from('pain_signals')
      .select('title, excerpt, community, country, url, captured_at, score')
      .textSearch('search', q, { type: 'websearch', config: 'spanish' })
      .order('score', { ascending: false, nullsFirst: false })
      .limit(LIMIT);

    if (country) query = query.eq('country', country);

    const { data, error } = await query;
    if (error) {
      console.error('[pain-search] query failed:', error.message);
      return NextResponse.json({ results: [], note: 'La búsqueda falló. Sigue sin ella.' });
    }

    const rows = data ?? [];

    /*
     * When a country filter finds nothing, say so and fall back rather than
     * returning an empty list. "No tengo nada de Chile sobre esto, pero de
     * otros mercados sí" is a useful sentence; silence reads as "no existe",
     * which is the failure the persona is written to avoid.
     */
    let note: string | undefined;
    let results = rows;
    if (country && rows.length === 0) {
      const wider = await supabase
        .from('pain_signals')
        .select('title, excerpt, community, country, url, captured_at, score')
        .textSearch('search', q, { type: 'websearch', config: 'spanish' })
        .order('score', { ascending: false, nullsFirst: false })
        .limit(LIMIT);
      results = wider.data ?? [];
      if (results.length > 0) {
        note = `Sin registros de ${country} sobre esto. Lo que sigue es de otros mercados: el problema puede parecerse, pero la normativa y los plazos no.`;
      }
    }

    return NextResponse.json({
      results: results.map((r) => ({
        titulo: r.title,
        cita: r.excerpt,
        foro: r.community,
        pais: r.country,
        url: r.url,
        capturado: r.captured_at,
      })),
      note:
        note ??
        (results.length === 0
          ? 'No hay registros sobre ese tema en el radar. Dilo y sigue con el método.'
          : 'Esto es lo que se quejó gente en foros públicos: evidencia de dónde mirar, no validación. Validar sigue siendo que alguien pague.'),
    });
  } catch (err) {
    console.error('[pain-search] lookup failed:', err);
    return NextResponse.json({ results: [], note: 'La búsqueda falló. Sigue sin ella.' });
  }
}
