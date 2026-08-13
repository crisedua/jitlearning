/**
 * Pain signals: turning a raw forum sweep into rows worth showing a learner,
 * and reading them back.
 *
 * The value here is the filter, not the fetch. A sweep of Reddit returns
 * mostly noise — the first one done for this project was about half drama and
 * memes — and handing that to someone looking for a business idea is worse
 * than handing them nothing, because it looks like evidence. So a row only
 * becomes visible when it shows the signals the method actually cares about:
 * an existing spend, a homemade workaround, a deadline, an unprompted
 * complaint.
 *
 * Nothing here scrapes. `scripts/scrape-pains.ts` fetches and calls in;
 * `/api/pain-search` reads.
 */
import type { RedditPost } from './apify';

/**
 * Country by community, and only where the community *is* the country.
 *
 * A pain from another market is still useful — the shape of the problem
 * travels even when the regulation does not — but it must be labelled
 * honestly, because a learner will act on a local pain differently than on a
 * foreign one. Anything not on this list stays null rather than being guessed
 * from the text.
 */
const COUNTRY_BY_COMMUNITY: Record<string, string> = {
  /*
   * Chile is listed most fully because it is the home market, and because
   * getting it wrong was visible: a learner in Santiago asked what people were
   * complaining about in Chile and heard "nothing". The material was there —
   * r/chileIT and r/FinanzasChile carry most of it — but neither community was
   * on this list, so every row landed untagged and the country filter matched
   * none of them. A community missing here is not a missing pain; it is a pain
   * nobody can find.
   */
  chile: 'CL',
  chileit: 'CL',
  finanzaschile: 'CL',
  santiago: 'CL',
  republicadechile: 'CL',
  emprendedoreschile: 'CL',
  emprendimientochile: 'CL',
  pymeschile: 'CL',
  chilecripto: 'CL',
  empleos_chile: 'CL',
  merval: 'AR',
  argentina: 'AR',
  empleos_ar: 'AR',
  devsarg: 'AR',
  startupsargentina: 'AR',
  negociosargentina: 'AR',
  mexico: 'MX',
  ayudamexico: 'MX',
  emprendimientomexico: 'MX',
  mexicali: 'MX',
  sistemasitmexico: 'MX',
  espana: 'ES',
  spain: 'ES',
  autonomos: 'ES',
  emprendedores: 'ES',
  esbolsa: 'ES',
  eslegal: 'ES',
  spainfire: 'ES',
  uruguay: 'UY',
  colombia: 'CO',
  calicolombia: 'CO',
  peru: 'PE',
  bolivia: 'BO',
};

/** Communities whose posts are Spanish regardless of the query language. */
const SPANISH_COMMUNITIES = new Set(Object.keys(COUNTRY_BY_COMMUNITY));

/**
 * Phrases that mark a real pain rather than an opinion.
 *
 * Grouped by the signal each one evidences, because the groups are what make
 * the score meaningful: three hits inside "workaround" is one person
 * describing one spreadsheet, while one hit in three different groups is a
 * problem with spend, a deadline and a workaround — which is the profile the
 * method says gets bought.
 */
const SIGNALS: Record<string, string[]> = {
  // A homemade fix someone already built and maintains.
  apaño: [
    'excel',
    'spreadsheet',
    'planilla',
    'hoja de c',
    'google sheet',
    'a mano',
    'manually',
    'manualmente',
    'copio y pego',
    'copy paste',
    'lo llevo en',
    'me armé',
    'built my own',
    'workaround',
  ],
  // Money already moving, or already lost.
  gasto: [
    'pago',
    'pagar',
    'no me pagan',
    'no pagan',
    'me deben',
    'owes me',
    'unpaid',
    'cobrar',
    'factura',
    'invoice',
    'perdí',
    'losing',
    'me cuesta',
    'costs me',
    'al mes',
    'per month',
    'contraté',
    'hired',
  ],
  // Something with a date attached.
  fecha: [
    'vence',
    'vencimiento',
    'plazo',
    'deadline',
    'cada mes',
    'every month',
    'todos los meses',
    'renovar',
    'expiring',
    'expires',
    'multa',
    'fine',
    'obligatorio',
    'mandatory',
  ],
  // The tone of someone complaining, not musing.
  queja: [
    'odio',
    'hate',
    'me tiene chato',
    'harto',
    'tired of',
    'frustrat',
    'pesadilla',
    'nightmare',
    'drowning',
    'no doy abasto',
    'imposible',
    'me da pereza',
    'lata',
    'un dolor',
  ],
  // Explicitly looking for a tool that does not exist.
  búsqueda: [
    'alguna herramienta',
    'alguna app',
    'is there a tool',
    'wish there was',
    'cómo lo hacen',
    'how do you keep track',
    'how do you manage',
    'recomiendan alg',
    'existe algo',
  ],
};

/**
 * Somebody describing *their own* business, in their own words.
 *
 * This gate did more than any other to make the sweep usable, and it took two
 * rounds to find. Matching topic words ("empresa", "negocio") was not enough:
 * fuel-price arguments, crime reporting and a travel guide all mention them,
 * because those are ordinary Spanish nouns. What separates evidence from
 * commentary is *ownership* — a pain worth building on is written in the first
 * person by the person living it, not reported about someone else. So the
 * phrases here all pair a first-person marker with the thing being run.
 */
const FIRST_PERSON_BUSINESS = [
  'mi negocio',
  'mi empresa',
  'mi pyme',
  'mi taller',
  'mi tienda',
  'mi local',
  'mi emprendimiento',
  'mi consulta',
  'mi servicio',
  'mis clientes',
  'mi cliente',
  'mis facturas',
  'mi facturación',
  'mi facturacion',
  'soy autónomo',
  'soy autonomo',
  'soy freelance',
  'tengo un negocio',
  'tengo una empresa',
  'tengo un local',
  'no me pagan',
  'me deben',
  'cobrar por mi',
  'mis pedidos',
  'my business',
  'my clients',
  'my customers',
  'my shop',
  'my store',
  'my company',
  'my invoice',
  'my invoices',
  'i run a',
  'i own a',
  'we run a',
  'owes me',
  'my employees',
  /*
   * Latin American idiom, and Chilean in particular.
   *
   * Added after a sweep aimed at Chile came back looking empty while the raw
   * data held exactly what was wanted: somebody fifteen months into building a
   * SaaS for minimarkets, a developer with twenty-six paying clients, and
   * freelancers losing money on the way dollars reach a Chilean account. None
   * of them ever write "mi negocio" — they write "boleteo", "mi pega", "llevo
   * meses construyendo". Matching only peninsular and English phrasing was a
   * filter that quietly excluded the market this product is built for.
   */
  'boleteo',
  'boletear',
  'boleta de honorarios',
  'mi pega',
  'mi emprendimiento',
  'llevo meses',
  'llevo años',
  'meses construyendo',
  'años construyendo',
  'me pagan',
  'trabajo para una empresa',
  'presto servicios',
  'clientes pagándome',
  'monté',
  'lancé',
  'mi propio negocio',
  'mi startup',
  'mi producto',
];

/** Posts that are almost always noise no matter what they contain. */
const NOISE_COMMUNITIES = new Set([
  'askreddit',
  'bestofredditorupdates',
  'aitah',
  'amitheasshole',
  'relationship_advice',
  'nosleep',
  'movies',
  'moviecritic',
  'subredditdrama',
  'confession',
  'trueoffmychest',
  'argentinabenderstyle',
  'nootropicosplus',
  'borupdates',
]);

export interface PainSignal {
  source: string;
  community: string | null;
  url: string;
  lang: string;
  country: string | null;
  title: string;
  excerpt: string;
  score: number | null;
  comments: number | null;
  query: string | null;
}

/** How many distinct signal groups a post hits. Zero means it is not evidence. */
export function signalGroups(post: RedditPost): string[] {
  const haystack = `${post.title ?? ''} ${post.body ?? ''}`.toLowerCase();
  return Object.entries(SIGNALS)
    .filter(([, phrases]) => phrases.some((p) => haystack.includes(p)))
    .map(([group]) => group);
}

/** Whether somebody is describing a business of their own. */
export function isFirstPersonBusiness(post: RedditPost): boolean {
  const haystack = `${post.title ?? ''} ${post.body ?? ''}`.toLowerCase();
  return FIRST_PERSON_BUSINESS.some((w) => haystack.includes(w));
}

/**
 * Whether a post is worth storing at all.
 *
 * Every gate here was added because a real sweep produced something
 * embarrassing without it. Measured on 567 Chilean-query posts: no filter kept
 * everything, topic words alone still kept 99 (fuel prices, crime reporting, a
 * travel guide), and requiring first-person ownership plus two signal groups
 * brought it to a handful — which is the right order of magnitude, because
 * most of what a search returns genuinely is not evidence.
 *
 * Two signal groups rather than one: a single hit is usually coincidence,
 * while two different kinds in the same post is somebody describing a
 * situation. And a body long enough to read as evidence, since a title alone
 * gives a learner nothing to act on.
 */
export function isPainEvidence(post: RedditPost): boolean {
  const community = (post.subreddit ?? '').toLowerCase();
  if (NOISE_COMMUNITIES.has(community)) return false;
  // Moderation-log communities mirror every action in a sub and match anything.
  if (community.endsWith('logs')) return false;
  if (!post.url || !post.title) return false;

  const body = (post.body ?? '').trim();
  if (body.length < 120) return false;

  if (!isFirstPersonBusiness(post)) return false;

  return signalGroups(post).length >= 2;
}

/** Trim a body to something a voice answer can quote without rambling. */
function excerpt(body: string, max = 600): string {
  const clean = body
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= max) return clean;
  // Cut on a sentence boundary when one is near the limit, so the quote does
  // not end mid-word in the middle of a spoken answer.
  const cut = clean.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '));
  return (lastStop > max * 0.6 ? cut.slice(0, lastStop + 1) : cut) + '…';
}

export function toSignal(post: RedditPost): PainSignal {
  const community = (post.subreddit ?? '').toLowerCase() || null;
  return {
    source: 'reddit',
    community,
    url: post.url!,
    lang: community && SPANISH_COMMUNITIES.has(community) ? 'es' : 'en',
    country: community ? (COUNTRY_BY_COMMUNITY[community] ?? null) : null,
    title: post.title!.replace(/\s+/g, ' ').trim().slice(0, 300),
    excerpt: excerpt(post.body ?? ''),
    score: typeof post.score === 'number' ? post.score : null,
    comments: typeof post.num_comments === 'number' ? post.num_comments : null,
    query: post.query ?? null,
  };
}

/**
 * Normalise a post from the general-purpose scraper into the fast actor's
 * shape.
 *
 * Two actors are in play: the fast search one this pipeline uses, and the
 * thorough one used for the exploratory sweeps whose output is still on disk
 * and still the best material collected. Rather than re-buy that data, this
 * translates its field names — `parsedCommunityName` for the subreddit,
 * `upVotes` for the score — and drops comment rows, which carry no title.
 */
export function fromGeneralScraper(item: Record<string, unknown>): RedditPost | null {
  if (item.dataType !== 'post') return null;
  return {
    title: typeof item.title === 'string' ? item.title : undefined,
    body: typeof item.body === 'string' ? item.body : undefined,
    url: typeof item.url === 'string' ? item.url : undefined,
    subreddit:
      typeof item.parsedCommunityName === 'string'
        ? item.parsedCommunityName
        : typeof item.communityName === 'string'
          ? item.communityName.replace(/^r\//, '')
          : undefined,
    score: typeof item.upVotes === 'number' ? item.upVotes : undefined,
    num_comments: typeof item.numberOfComments === 'number' ? item.numberOfComments : undefined,
  };
}

/** Filter a raw sweep down to storable evidence, de-duplicated by URL. */
export function curate(posts: RedditPost[]): PainSignal[] {
  const seen = new Set<string>();
  const out: PainSignal[] = [];
  for (const post of posts) {
    if (!isPainEvidence(post)) continue;
    const signal = toSignal(post);
    if (seen.has(signal.url)) continue;
    seen.add(signal.url);
    out.push(signal);
  }
  return out;
}
