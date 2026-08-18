/**
 * What people are complaining about, searchable by an agent mid-conversation.
 *
 * Nothing calls it today. It was built for the emprendedores coach, which was
 * retired when the product became one voice teacher, and no tool on the current
 * agent points here. The route works and is left standing; `/admin/radar` says
 * the same thing on the page, so a filling table does not read as a live
 * feature.
 *
 * This is an ElevenLabs *server tool*: the agent calls it during a call, so the
 * budget is a second or two, not the forty-odd seconds an Apify run takes. That
 * is the whole reason the sweep is offline — `npm run scrape:pains` fills the
 * table ahead of time and this route only reads it.
 *
 * Gated now, and read-only. Every row is an excerpt of a public forum post that
 * already carries a public URL, so there was never anything here to protect, and
 * this was left open on the reasoning that a shared secret sitting in a
 * third-party tool config would be a worse trade
 * than the thing it guarded. Row-level security exposes only `published` rows,
 * and the anon key cannot write, so the worst an unexpected caller can do is
 * read curated public quotes.
 *
 * Two things changed. `/api/ask` now carries INGEST_SECRET as a static header in
 * exactly that tool config, so the trade being avoided is one this product
 * already makes and finds acceptable. And nothing calls this at all: the coach
 * it was built for was retired, so what remained was an unauthenticated endpoint
 * running a text search against Postgres on every request, for no consumer.
 *
 * Not a leak. Just load and exposure with nothing on the other side of it, and
 * the fix costs nothing while that stays true. When the radar is reconnected,
 * the tool config carries the header the way /api/ask does.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { anonKey, authConfigured, supabaseUrl } from '@/lib/supabase/env';
import { requireSecret, UnauthorizedError } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Enough to answer with, few enough to say out loud. */
const LIMIT = 5;

/**
 * Two-letter codes the sweep tags rows with. Every Spanish-speaking market the
 * community map knows, so the coach can filter by the country a learner names
 * rather than by the handful that happened to be swept first.
 */
const COUNTRIES = new Set([
  'CL', 'AR', 'MX', 'ES', 'CO', 'PE', 'UY', 'BO', 'VE', 'EC',
  'CR', 'PA', 'PY', 'DO', 'GT', 'SV', 'HN', 'NI', 'CU', 'PR',
]);

export async function GET(req: Request) {
  try {
    requireSecret(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

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

    const COLUMNS = 'title, excerpt, community, country, lang, url, captured_at, score';
    type Row = {
      title: string;
      excerpt: string;
      community: string | null;
      country: string | null;
      lang: string | null;
      url: string;
      captured_at: string;
      score: number | null;
    };

    async function search(term: string, filterCountry: string | null): Promise<Row[]> {
      let query = supabase
        .from('pain_signals')
        .select(COLUMNS)
        .textSearch('search', term, { type: 'websearch', config: 'spanish' })
        .order('score', { ascending: false, nullsFirst: false })
        .limit(LIMIT);
      if (filterCountry) query = query.eq('country', filterCountry);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as Row[];
    }

    /*
     * Any of the words, not all of them.
     *
     * `websearch_to_tsquery` ANDs bare terms, and the coach passes whole
     * phrases — "cobros a clientes que no pagan". Measured against the live
     * table: "cobros" found 1 row, "clientes" found 2, and "cobros clientes"
     * found none, because no single row happened to contain both stems. The
     * OR form is what a search over a few dozen short excerpts actually needs.
     */
    const orTerm = q
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .join(' OR ');

    /*
     * Precision first, then recall, and say which one answered. Each step
     * widens exactly one dimension so the note can stay truthful about what
     * was relaxed.
     */
    let note: string | undefined;
    let results = await search(q, country);

    if (results.length === 0 && orTerm && orTerm !== q) {
      results = await search(orTerm, country);
    }
    if (results.length === 0 && country) {
      results = await search(orTerm || q, null);
      if (results.length > 0) {
        note = `Sin registros de ${country} sobre esto. Lo que sigue es de otros mercados: el problema puede parecerse, pero la normativa y los plazos no.`;
      }
    }

    /*
     * Last resort: the strongest pains on record, whatever the topic.
     *
     * "Búscame un dolor para empezar" is a legitimate request from somebody
     * with no idea yet, and the coach turns it into a topic query — one real
     * session asked for "aplicaciones web software" and got nothing, because
     * the radar holds invoicing and admin pains, not web-app pains. Answering
     * "no hay nada" there is technically true and practically useless: the
     * radar was full, just not of that. Handing back the top-scored rows with
     * a note that they are off-topic keeps the conversation moving and lets
     * the coach say honestly where they came from.
     */
    if (results.length === 0) {
      const { data } = await supabase
        .from('pain_signals')
        .select(COLUMNS)
        .order('score', { ascending: false, nullsFirst: false })
        .limit(LIMIT);
      results = (data ?? []) as Row[];
      if (results.length > 0) {
        note = `Nada específico sobre "${q}" en el radar. Lo que sigue son los dolores más fuertes que sí tengo registrados, sobre otros temas: dilo así al contarlos, y úsalos para mostrar qué forma tiene un dolor que la gente sí paga por resolver.`;
      }
    }

    /*
     * Field names in Spanish, and the source language stated per row.
     *
     * The coach speaks Spanish to everyone, but a good share of the corpus is
     * English — the strongest signal in it is a US contractor owed $14,200. A
     * row marked `idioma: "en"` is a row whose quote must be translated before
     * it is spoken, and saying so per row is more reliable than hoping the
     * model notices mid-sentence.
     */
    const spoken = results.map((r) => ({
      titulo: r.title,
      cita: r.excerpt,
      idioma: r.lang === 'en' ? 'en' : 'es',
      foro: r.community,
      pais: r.country ?? 'sin país identificado',
      url: r.url,
      capturado: r.captured_at,
    }));
    const needsTranslation = spoken.some((r) => r.idioma === 'en');

    return NextResponse.json({
      results: spoken,
      note:
        note ??
        (results.length === 0
          ? 'No hay registros sobre ese tema en el radar. Dilo y sigue con el método.'
          : 'Esto es lo que se quejó gente en foros públicos: evidencia de dónde mirar, no validación. Validar sigue siendo que alguien pague.'),
      ...(needsTranslation
        ? {
            idioma_aviso:
              'Hay citas en inglés. Tradúcelas al español al contarlas; nunca las leas en su idioma original.',
          }
        : {}),
    });
  } catch (err) {
    console.error('[pain-search] lookup failed:', err);
    return NextResponse.json({ results: [], note: 'La búsqueda falló. Sigue sin ella.' });
  }
}
