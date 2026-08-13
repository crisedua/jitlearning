/**
 * Sweep public forums for pain signals and store the ones worth showing.
 *
 *   npm run scrape:pains                  # every query, all markets
 *   npm run scrape:pains -- --paises      # only the per-country set
 *   npm run scrape:pains -- --general     # only the language-neutral set
 *   npm run scrape:pains -- --seed        # load the committed signals, no sweep
 *   npm run scrape:pains -- --dry         # report, write nothing
 *
 * Runs offline, never in a request: an Apify run takes tens of seconds, and the
 * coach's tool call has to answer in about one. This fills the table; the tool
 * reads it.
 *
 * Rows land `published = true` because `curate()` has already thrown out
 * everything that does not carry at least two of the method's pain signals. If
 * that filter ever loosens, flip this to false and publish by hand — a learner
 * seeing noise dressed as evidence is the failure worth avoiding.
 */
import './env';
import { readFile, writeFile } from 'node:fs/promises';
import { monthlySpendUsd, sweepReddit, type RedditPost } from '../src/lib/apify';
import { curate, type PainSignal } from '../src/lib/pains';
import { storePainSignals } from '../src/lib/pains-store';

/**
 * The standing query set: phrases that surface a complaint rather than an
 * opinion. Written in both languages because the strongest finding of the
 * first sweeps was that the same pains appear in both.
 */
const QUERIES_GENERAL = [
  'clientes que no pagan',
  'facturas vencidas cobrar',
  'llevo el control en excel',
  'alguna herramienta para llevar clientes',
  'no doy abasto con los mensajes',
  'drowning in spreadsheets small business',
  'customer owes me invoice',
  'how do you keep track of clients',
  'is there a tool that small business',
  'hate doing this manually',
];

/**
 * The same complaint, market by market.
 *
 * Naming each country explicitly rather than trusting one Spanish sweep to
 * reach all of them: Reddit's search ranks by engagement, and the large
 * communities crowd out the small ones, so "clientes que no pagan" returns
 * Spain and Mexico and never Uruguay. A country in this list is a country the
 * coach can answer about.
 *
 * The phrasing stays local on purpose — a Chilean writes "boleta", an
 * Argentine "monotributo", a Spaniard "autónomo". Searching for the local word
 * is what surfaces the local pain.
 */
const QUERIES_BY_COUNTRY = [
  // Chile
  'pyme chile problema',
  'emprender en chile',
  'boleta honorarios chile problema',
  // Argentina
  'monotributo problema facturar',
  'emprender en argentina pyme',
  'clientes no pagan argentina',
  // México
  'sat factura problema pyme',
  'emprender en méxico negocio',
  'clientes no pagan méxico',
  // España
  'autónomo factura no me pagan',
  'emprender en españa pyme',
  // Colombia, Perú, Uruguay y el resto
  'emprender en colombia negocio',
  'emprender en perú negocio',
  'emprender en uruguay pyme',
  'facturación electrónica problema pyme',
  'cobrar a clientes latinoamérica',
];

async function store(signals: PainSignal[], dry: boolean): Promise<number> {
  const { stored, error } = await storePainSignals(signals, { dry });
  if (error) console.error('  !', error);
  return stored;
}

/**
 * Where a sweep's raw output is kept.
 *
 * Tuning the filter is the slow part of this work, and re-sweeping to test a
 * regex change costs money and minutes. `--save-raw` writes the untouched
 * posts here and `--from-raw` replays them, so the filter can be iterated for
 * free against the exact material that exposed its last hole.
 */
const RAW_PATH = 'scripts/.pains-raw.json';

async function collect(
  args: string[],
  queries: string[],
): Promise<RedditPost[]> {
  if (args.includes('--from-raw')) {
    const posts = JSON.parse(await readFile(RAW_PATH, 'utf8')) as RedditPost[];
    console.log(`Replaying ${posts.length} post(s) from ${RAW_PATH} — no sweep, no cost.\n`);
    return posts;
  }

  const before = await monthlySpendUsd();
  console.log(
    `Apify: US$${before.spent.toFixed(2)} spent this month${
      before.limit ? ` of US$${before.limit}` : ''
    }`,
  );
  if (before.limit && before.spent >= before.limit * 0.9) {
    console.error('! Within 10% of the monthly limit. Not sweeping.');
    process.exit(1);
  }

  console.log(`\nSweeping ${queries.length} quer${queries.length === 1 ? 'y' : 'ies'}…`);
  const posts = await sweepReddit({ queries, maxItems: 400, timeframe: 'year' });
  console.log(`  ${posts.length} post(s) returned`);

  if (args.includes('--save-raw')) {
    await writeFile(RAW_PATH, JSON.stringify(posts, null, 1));
    console.log(`  raw output saved to ${RAW_PATH}`);
  }
  return posts;
}

/**
 * The signals kept from the exploratory sweeps, committed so a fresh clone —
 * or a fresh database — starts with evidence instead of an empty table. They
 * are already curated, so they go straight in without passing the filter again.
 */
const SEED_PATH = 'src/lib/pains-seed.json';

async function seed(dry: boolean): Promise<void> {
  const signals = JSON.parse(await readFile(SEED_PATH, 'utf8')) as PainSignal[];
  console.log(`Seeding ${signals.length} curated signal(s) from ${SEED_PATH}…\n`);
  for (const s of signals) {
    const where = [s.community, s.country].filter(Boolean).join(' · ');
    console.log(`  · [${where}] ${s.title.slice(0, 80)}`);
  }
  const stored = await store(signals, dry);
  console.log(dry ? '\nDry run: nothing written.' : `\n✓ ${stored} row(s) stored and published.`);
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');

  if (args.includes('--seed')) {
    await seed(dry);
    return;
  }

  const queries = args.includes('--paises')
    ? QUERIES_BY_COUNTRY
    : args.includes('--general')
      ? QUERIES_GENERAL
      : [...QUERIES_GENERAL, ...QUERIES_BY_COUNTRY];

  const posts = await collect(args, queries);

  const signals = curate(posts);
  console.log(`  ${signals.length} carried at least two pain signals\n`);

  for (const s of signals.slice(0, 12)) {
    const where = [s.community, s.country].filter(Boolean).join(' · ');
    console.log(`  · [${where}] ${s.title.slice(0, 80)}`);
  }
  if (signals.length > 12) console.log(`  … and ${signals.length - 12} more`);

  const stored = await store(signals, dry);
  console.log(
    dry ? '\nDry run: nothing written.' : `\n✓ ${stored} row(s) stored and published.`,
  );

  if (!args.includes('--from-raw')) {
    const after = await monthlySpendUsd();
    console.log(`Apify: US$${after.spent.toFixed(2)} spent after this sweep.`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
