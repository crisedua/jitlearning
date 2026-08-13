/**
 * The LLM radar: discovery of first-person business pains via web search,
 * curated into `pain_signals` rows.
 *
 * The logic is borrowed from the user's sibling radar app, adapted to this
 * product's method: two sequential Responses API calls — a scan with web
 * search steered by an opinionated prompt, then a curation pass that emits
 * structured JSON — followed by a cheap URL liveness check. The filter that
 * `pains.ts` implements with keyword lists, this implements with prompt rules
 * and a scoring gate; both write the same row shape through the same store.
 *
 * What keeps this honest, in order of importance: the evidence rule (verbatim
 * quote plus a real URL, or the pain is dropped), the country rule (stated by
 * the source or null — never guessed), and the exclusion block (recent rows
 * are shown to the model as already-found so the budget goes to new pains).
 */
import { z } from 'zod';
import { createResponse, estimateUsd } from './openai';
import { excerpt, isKnownCountry, type PainSignal } from './pains';
import { serviceConfigured, supabaseAdmin } from './supabase/admin';

export type RadarScope = 'cl' | 'latam' | 'en' | 'all';

export const RADAR_SCOPES: Record<RadarScope, string> = {
  cl: 'Chile',
  latam: 'Latinoamérica',
  en: 'Foros en inglés',
  all: 'Todos los mercados',
};

export interface RadarRunResult {
  signals: PainSignal[];
  /** Items the curation or the URL check discarded. */
  dropped: number;
  /** Honesty output: insufficiency notes and suggested alternative searches. */
  notes: string[];
  usage: { inputTokens: number; outputTokens: number; webSearches: number; estimatedUsd: number };
}

/* ------------------------------------------------------------- prompts ---- */

const SCAN_SYSTEM = `Eres el investigador del radar de dolores de ModoJIT. Tu trabajo es encontrar dolores declarados en primera persona por personas que llevan su propio negocio, pyme o trabajo independiente. Buscas quejas reales de gente real, no ideas de negocio ni opiniones de comentaristas.

## Qué cuenta como dolor

Un dolor vale si muestra al menos una de estas señales, y vale más mientras más señales junte:

- Gasto existente: ya paga a alguien, paga una herramienta que odia, o pierde plata por el problema ("le pago a una persona para que...", "se me cayó una venta por...").
- Apaño casero: una planilla monstruosa, un proceso a mano, tres herramientas pegadas con cinta ("lo llevo en excel", "copio y pego cada semana").
- Fecha en el calendario: vence, se declara, se renueva, multa si se falla ("cada mes al cerrar", "antes del plazo del SII").
- Queja espontánea: lo cuenta sin que nadie le pregunte, con fastidio genuino.
- Búsqueda explícita de herramienta: "¿existe algo para...?", "ojalá hubiera una app que...", "is there a tool for...".

Buscamos analgésicos, no vitaminas: problemas que duelen hoy, no mejoras que estarían bien algún día.

## Qué NO cuenta

- Noticias, política, precios de combustibles, farándula.
- Quejas sobre terceros o en abstracto ("las empresas deberían...", "mi jefe es un...").
- Gente promocionando su propio producto o buscando feedback de su SaaS.
- Publicaciones sin cuerpo: un título solo no es evidencia.

## Dónde buscar

Foros de dueños de negocio: en inglés r/smallbusiness, r/sweatystartup, r/msp, r/freelance, IndieHackers, Ask HN; en español r/autonomos, r/emprendedores, r/EmprendedorES, r/chileIT, r/FinanzasChile y los subreddits de cada país hispanohablante. También reseñas de 1 a 3 estrellas en G2, Capterra o Trustpilot, e hilos "alternative to [herramienta]".

## Cómo buscar

Presupuesto: entre 8 y 14 búsquedas web. Haz búsquedas amplias y exprime cada una: de un hilo con veinte comentarios pueden salir tres o cuatro dolores distintos, y esa es la forma barata de encontrar volumen. Varía las frases en ambos idiomas: "no me pagan las facturas", "llevo el control en excel", "pago a alguien para que", "sick of chasing invoices", "how do you keep track of", "is there a tool for". Si una fuente o frase no da nada en dos intentos, cambia de fuente o reformula; no insistas.

Apunta a 12 dolores o más. Menos de 8 significa que dejaste búsquedas sin usar o que descartaste demasiado rápido: vuelve a buscar con otras palabras antes de darte por vencido.

## Regla de evidencia (la más importante)

Cada dolor lleva una cita textual en su idioma original y la URL completa y real de la publicación concreta de donde salió. Si no tienes la URL exacta, el dolor se descarta: nunca inventes, acortes ni reconstruyas una URL. Prefiere dolores con dos o más quejas independientes.

## Honestidad

Si encuentras menos de 8 dolores verificables, entrégalos y di cuántos faltaron y por qué. Nunca rellenes con dolores plausibles que no leíste en esta sesión.

## Diversidad

Máximo 3 dolores por nicho o rubro. Cubre al menos 5 nichos distintos, incluyendo alguno no obvio: no todo es software y agencias — hay talleres, consultas médicas, transporte, arriendos, gimnasios, ferreterías, colegios, agricultura.

## Cómo respondes

Buscas primero y respondes después. No anuncias lo que vas a hacer, no pides permiso, no propones un plan de búsqueda: haces las búsquedas y entregas el informe. Tu respuesta empieza directamente con el primer dolor encontrado.

## Formato de salida

Lista numerada [1]..[N]. Por cada dolor:
- TITULO: una línea, en el idioma de la fuente.
- CITA: la queja textual entre comillas, sin traducir.
- URL: la dirección completa.
- FORO: comunidad o sitio.
- IDIOMA: es o en.
- PAIS: código de dos letras SOLO si la fuente lo declara o la comunidad es de ese país (r/chile → CL). Si no, escribe "desconocido". Nunca lo deduzcas del idioma.
- SEÑALES: cuáles de las cinco señales muestra.`;

/**
 * The territories a sweep covers, run as separate concurrent scans.
 *
 * One scan with one framing kept returning the same handful of pains: a
 * search budget spent on "clientes que no pagan" never reaches the person
 * drowning in a compliance deadline, because the model follows its first
 * thread. Splitting the budget across angles and running them at once
 * multiplies the yield for the same wall-clock — the calls are independent,
 * and the curation pass dedupes by URL afterwards anyway.
 */
const ANGLES: { id: string; brief: string }[] = [
  {
    id: 'cobros',
    brief:
      'Concéntrate en el dinero que ya se ganó y no llega: facturas impagas, clientes morosos, perseguir el cobro, adelantar impuestos de plata no cobrada, comisiones y demoras bancarias.',
  },
  {
    id: 'seguimiento',
    brief:
      'Concéntrate en llevar el negocio a mano: planillas monstruosas, seguimiento de clientes y pedidos, inventario, agendas, presupuestos que se pierden, cosas que se olvidan porque están en la cabeza o en tres herramientas distintas.',
  },
  {
    id: 'cumplimiento',
    brief:
      'Concéntrate en obligaciones con fecha y multa: impuestos y declaraciones, facturación electrónica, registro de jornada, certificados y documentos que vencen, papeleo con el Estado, contratos y temas laborales.',
  },
  {
    id: 'conversion',
    brief:
      'Concéntrate en conseguir y atender clientes: no dar abasto respondiendo mensajes por WhatsApp o redes, cotizar y que no respondan, marketing que no convierte, conseguir los primeros clientes, precios.',
  },
  /*
   * The sea, on purpose.
   *
   * The other four angles hunt pains that any trade shares, and they keep
   * landing in offices — invoices, spreadsheets, WhatsApp. A fisherman's
   * paperwork, a port's waiting times and a caleta's traceability never
   * surface from those queries, because nobody in those worlds phrases their
   * problem as "clientes que no pagan". The corpus now carries the blue
   * economy material; this is what fills the radar to match it.
   */
  {
    id: 'mar',
    brief:
      'Concéntrate en el mundo del mar y la costa: pesca artesanal y acuicultura (trazabilidad de la captura, papeleo de SERNAPESCA, vender sin intermediarios, certificaciones que exige el comprador), puertos y logística marítima (tiempos de espera, coordinación de camiones, documentación), turismo costero (reservas, temporada, cancelaciones), y residuos y reciclaje en el borde costero (cumplimiento de la Ley REP, reportabilidad, recolección). Busca en foros y comunidades de pescadores, portuarios, acuicultores y operadores turísticos, en español y en inglés.',
  },
];

/**
 * The user turn: an order to execute, not a briefing.
 *
 * The first production run failed on exactly this. The turn was nothing but
 * configuration — scope rules and an exclusion list — so the model treated it
 * as a proposal to evaluate and replied "Sí, procede: inicia hasta 12
 * búsquedas…", which is a perfectly sensible answer to a question nobody meant
 * to ask. It cost three cents, made zero searches, and looked like a market
 * with no complaints in it. The imperative first line, and the ban on
 * announcing intent, are what turn the same prompt into work.
 */
function scanTask(scope: RadarScope, angle: { id: string; brief: string }): string {
  return `Ejecuta el escaneo ahora. Empieza por hacer búsquedas web reales de inmediato — no describas lo que vas a hacer, no pidas confirmación, no propongas un plan. Tu respuesta debe ser el informe de dolores encontrados, con sus citas y URLs.

ÁNGULO DE ESTA CORRIDA: ${angle.brief}

${scopeBlock(scope)}`;
}

function scopeBlock(scope: RadarScope): string {
  switch (scope) {
    case 'cl':
      return `AMBITO: Chile primero. Prioriza foros y comunidades chilenas (r/chile, r/chileIT, r/FinanzasChile, r/Santiago) y usa vocabulario local en las búsquedas: "boleta de honorarios", "pega", "SII", "Previred", "chato de". Considera también reseñas negativas de herramientas locales establecidas (AgendaPro, Bsale, Nubox, Defontana, Buk, Fintoc) — una queja sobre un incumbente local es un dolor con gasto ya declarado.`;
    case 'latam':
      return `AMBITO: Latinoamérica. Reparte las búsquedas entre Argentina ("monotributo", "AFIP"), México ("SAT", "factura CFDI"), Colombia, Perú y Uruguay, con el vocabulario de cada país. Al menos una búsqueda por país grande.`;
    case 'en':
      return `AMBITO: foros en inglés (Estados Unidos y global). Reddit de dueños de negocio, IndieHackers, reseñas en G2/Capterra.`;
    case 'all':
      return `AMBITO: todos los mercados. Al menos la mitad de las búsquedas en español, repartidas entre países hispanohablantes; el resto en inglés.`;
  }
}

const CURATE_SYSTEM = `Eres el curador del radar de dolores de ModoJIT. Recibes el informe de un escaneo de foros y lo conviertes en datos estructurados. Tu salida es exclusivamente el JSON del esquema; nada más.

## Reglas por campo

- No agregues dolores que no estén en el informe, y no completes datos que falten: lo que no está, es null.
- titulo: corto, en el idioma de la fuente.
- cita: copiada del informe sin traducir ni corregir, máximo 600 caracteres.
- url: copiada exacta del informe. Un dolor cuyo informe no trae URL completa se descarta (no aparece en la salida).
- idioma: "es" o "en", según el idioma de la cita.
- pais: código ISO de dos letras SOLO si el informe lo declara; si dice "desconocido" o no lo dice, null.
- foro: la comunidad, en minúsculas, o null.
- tema: cobro (cobrar lo ya ganado: facturas, pagos atrasados, morosos) · seguimiento (llevar clientes, pedidos o stock a mano) · cumplimiento (impuestos, plazos legales, certificados, multas) · conversion (conseguir clientes, cotizaciones, responder mensajes, vender) · otro.
- senales: las señales que el informe identificó (gasto, apano, fecha, queja, busqueda).

## Puntajes (0 a 100)

- puntaje_evidencia, anclado mecánicamente: una sola URL → máximo 40; dos quejas independientes → máximo 70; dos o más con gasto declarado en dinero → hasta 100.
- puntaje_total: pondera evidencia 40%, gasto existente 25%, urgencia con fecha 20%, especificidad en primera persona 15%.

## Veredicto (la compuerta)

- "painkiller": puntaje_total ≥ 70 y puntaje_evidencia ≥ 40.
- "vitamin": dolor real pero débil, 40 a 69.
- "ruido": bajo 40, o no es primera persona, o es promoción encubierta. (La aplicación lo descarta; márcalo igual.)

## Honestidad

Si menos de 5 dolores pasan la compuerta como painkiller o vitamin, marca hallazgos_insuficientes en true y llena recomendaciones_busqueda con 3 a 5 frases de búsqueda alternativas y concretas.`;

/* -------------------------------------------------------------- schema ---- */

const RADAR_JSON_SCHEMA = {
  name: 'radar_dolores',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      dolores: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            titulo: { type: 'string' },
            cita: { type: 'string' },
            url: { type: 'string' },
            idioma: { type: 'string', enum: ['es', 'en'] },
            pais: { type: ['string', 'null'] },
            foro: { type: ['string', 'null'] },
            tema: {
              type: 'string',
              enum: ['cobro', 'seguimiento', 'cumplimiento', 'conversion', 'otro'],
            },
            senales: {
              type: 'array',
              items: { type: 'string', enum: ['gasto', 'apano', 'fecha', 'queja', 'busqueda'] },
            },
            puntaje_evidencia: { type: 'integer', minimum: 0, maximum: 100 },
            puntaje_total: { type: 'integer', minimum: 0, maximum: 100 },
            veredicto: { type: 'string', enum: ['painkiller', 'vitamin', 'ruido'] },
          },
          required: [
            'titulo',
            'cita',
            'url',
            'idioma',
            'pais',
            'foro',
            'tema',
            'senales',
            'puntaje_evidencia',
            'puntaje_total',
            'veredicto',
          ],
        },
      },
      hallazgos_insuficientes: { type: 'boolean' },
      recomendaciones_busqueda: { type: 'array', items: { type: 'string' } },
    },
    required: ['dolores', 'hallazgos_insuficientes', 'recomendaciones_busqueda'],
  } as Record<string, unknown>,
};

/** Runtime mirror of the schema — structured outputs promise validity, zod verifies it. */
const RadarOutput = z.object({
  dolores: z.array(
    z.object({
      titulo: z.string(),
      cita: z.string(),
      url: z.string(),
      idioma: z.enum(['es', 'en']),
      pais: z.string().nullable(),
      foro: z.string().nullable(),
      tema: z.enum(['cobro', 'seguimiento', 'cumplimiento', 'conversion', 'otro']),
      senales: z.array(z.string()),
      puntaje_evidencia: z.number(),
      puntaje_total: z.number(),
      veredicto: z.enum(['painkiller', 'vitamin', 'ruido']),
    }),
  ),
  hallazgos_insuficientes: z.boolean(),
  recomendaciones_busqueda: z.array(z.string()),
});

/* ----------------------------------------------------- exclusion memory --- */

/**
 * What the radar already knows, shown to the model as already-found.
 *
 * Two sources: this table's own recent rows, and the sibling radar app's
 * `radar_findings` (same Supabase project). The sibling table's shape is not
 * ours to depend on, so it is read defensively and any error — absent table,
 * different columns — degrades to an empty list rather than blocking a run.
 */
async function exclusionBlock(): Promise<string> {
  if (!serviceConfigured()) return '';
  const lines: string[] = [];

  const { data } = await supabaseAdmin()
    .from('pain_signals')
    .select('url, title')
    .order('captured_at', { ascending: false })
    .limit(50);
  for (const row of data ?? []) lines.push(`- ${row.title} (${row.url})`);

  try {
    const { data: findings, error } = await supabaseAdmin()
      .from('radar_findings')
      .select('*')
      .limit(30);
    if (!error) {
      for (const f of (findings ?? []) as Array<Record<string, unknown>>) {
        const name = typeof f.name === 'string' ? f.name : null;
        const pain =
          typeof f.pain === 'string' ? f.pain : typeof f.summary === 'string' ? f.summary : '';
        if (name) lines.push(`- ${name}${pain ? ` — ${pain.slice(0, 120)}` : ''}`);
      }
    }
  } catch {
    // The sibling table is optional context, never a dependency.
  }

  if (lines.length === 0) return '';
  return `\n\nDOLORES YA REGISTRADOS — no los reportes de nuevo; gasta el presupuesto de búsqueda en dolores NUEVOS:\n${lines.join('\n')}`;
}

/* ------------------------------------------------------------ URL check --- */

/**
 * Liveness gate against hallucinated links.
 *
 * Drops only what is provably gone (404/410). Anti-bot walls and timeouts
 * keep the row: Reddit blocks datacenter fetches often enough that treating a
 * 403 as fake would throw away real evidence, and a bad keep is still visible
 * to a human on /admin/radar while a bad drop is invisible forever.
 */
async function urlAlive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(5_000),
    });
    return res.status !== 404 && res.status !== 410;
  } catch {
    return true;
  }
}

/* ------------------------------------------------------------- pipeline --- */

export async function runRadarLlm(opts: {
  scope: RadarScope;
  log?: (line: string) => void;
}): Promise<RadarRunResult> {
  const log = opts.log ?? (() => {});
  const notes: string[] = [];

  log('Preparando memoria de exclusión…');
  const exclusions = await exclusionBlock();

  log(
    `Etapa 1/2: ${ANGLES.length} escaneos en paralelo (${RADAR_SCOPES[opts.scope]})…`,
  );
  /*
   * Concurrent, and tolerant of a partial failure: one angle timing out
   * should cost its share of the findings, not the whole run. Settled rather
   * than all-or-nothing for exactly that reason.
   */
  const settled = await Promise.allSettled(
    ANGLES.map((angle) =>
      createResponse({
        instructions: SCAN_SYSTEM,
        input: scanTask(opts.scope, angle) + exclusions,
        webSearch: true,
        requireTool: true,
        reasoningEffort: 'low',
        timeoutMs: 150_000,
      }).then((r) => ({ angle, ...r })),
    ),
  );

  type Scan = Awaited<ReturnType<typeof createResponse>> & { angle: (typeof ANGLES)[number] };
  const scans = settled
    .filter((s): s is PromiseFulfilledResult<Scan> => s.status === 'fulfilled')
    .map((s) => s.value);

  for (const s of settled) {
    if (s.status === 'rejected') {
      const message = s.reason instanceof Error ? s.reason.message : String(s.reason);
      notes.push(`Un ángulo del escaneo falló: ${message}`);
    }
  }
  for (const s of scans) {
    log(`  · ${s.angle.id}: ${s.webSearches} búsquedas, ${s.text.length} caracteres`);
  }

  /*
   * A sweep that searched nothing is a failed run, not an empty one.
   *
   * The first production run reported "0 señales · US$0.03" and looked like a
   * quiet market. It was not: the model had replied with a *plan* to search
   * instead of searching, and every downstream stage faithfully processed
   * that plan into zero rows. Failing here makes the difference between "no
   * pains out there" and "the search never ran" impossible to confuse.
   */
  const totalSearches = scans.reduce((n, s) => n + s.webSearches, 0);
  if (scans.length === 0 || totalSearches === 0) {
    throw new Error(
      'Ningún escaneo hizo búsquedas web: el modelo respondió con un plan en vez de buscar. ' +
        'No se escribió nada. Vuelve a intentarlo.',
    );
  }

  const combined = scans
    .map((s) => `## Ángulo: ${s.angle.id}\n\n${s.text}`)
    .join('\n\n---\n\n');

  log(`Etapa 2/2: curaduría de ${scans.length} informes…`);
  const curatedRaw = await createResponse({
    instructions: CURATE_SYSTEM,
    input: combined,
    reasoningEffort: 'medium',
    timeoutMs: 120_000,
    jsonSchema: RADAR_JSON_SCHEMA,
  });

  const parsed = RadarOutput.parse(JSON.parse(curatedRaw.text));
  if (parsed.hallazgos_insuficientes) {
    notes.push('El escaneo encontró menos dolores verificables de lo esperado.');
    if (parsed.recomendaciones_busqueda.length > 0) {
      notes.push(`Búsquedas sugeridas: ${parsed.recomendaciones_busqueda.join(' · ')}`);
    }
  }

  let dropped = 0;
  const seen = new Set<string>();
  const candidates = parsed.dolores.filter((d) => {
    if (d.veredicto === 'ruido') {
      dropped++;
      return false;
    }
    const key = d.url.trim();
    if (!key.startsWith('http') || seen.has(key)) {
      dropped++;
      return false;
    }
    seen.add(key);
    // Already known: the upsert would refresh it harmlessly, but the run's
    // "new signals" count should mean what it says.
    if (exclusions.includes(key)) {
      dropped++;
      return false;
    }
    return true;
  });

  log(`Verificando ${candidates.length} URL(s)…`);
  const alive = await Promise.all(candidates.map((d) => urlAlive(d.url)));
  const kept = candidates.filter((_, i) => {
    if (!alive[i]) dropped++;
    return alive[i];
  });

  const signals: PainSignal[] = kept.map((d) => ({
    source: 'radar-llm',
    community: d.foro?.toLowerCase().replace(/^r\//, '') ?? null,
    url: d.url.trim(),
    lang: d.idioma,
    country: d.pais && isKnownCountry(d.pais.toUpperCase()) ? d.pais.toUpperCase() : null,
    title: d.titulo.replace(/\s+/g, ' ').trim().slice(0, 300),
    excerpt: excerpt(d.cita),
    /*
     * puntaje_total, not upvotes. Mixed semantics with the Reddit rows —
     * accepted deliberately: `pain-search` ranks by `score desc` and a null
     * would sink every LLM row below every scraped one. It is a ranking hint,
     * not a statistic.
     */
    score: d.puntaje_total,
    comments: null,
    query: `radar-llm:${opts.scope}`,
    theme: d.tema,
    verdict: d.veredicto === 'painkiller' ? 'painkiller' : 'vitamin',
  }));

  const usage = {
    inputTokens:
      scans.reduce((n, s) => n + s.usage.input_tokens, 0) + curatedRaw.usage.input_tokens,
    outputTokens:
      scans.reduce((n, s) => n + s.usage.output_tokens, 0) + curatedRaw.usage.output_tokens,
    webSearches: totalSearches,
    estimatedUsd:
      scans.reduce((n, s) => n + estimateUsd(s.usage, s.webSearches), 0) +
      estimateUsd(curatedRaw.usage, 0),
  };

  return { signals, dropped, notes, usage };
}
