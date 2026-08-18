/**
 * The deployment status page reports on every variable the README says matters.
 *
 * `/admin/estado` is the one place that answers for the deployment rather than
 * for a laptop, and its environment section ends in "todas puestas" when nothing
 * it checks is missing. It checked five of the eleven variables the README
 * documents, so that sentence could appear on a screen that was simultaneously
 * reporting a missing service role two sections above.
 *
 * A green line about a subset, presented as a green line about everything, is
 * exactly the failure this page exists to catch.
 *
 * The README table is the contract: it is what somebody setting this up reads,
 * and anything on it is something whose absence they need told.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { TEACHER } from './teacher';

const ROOT = process.cwd();

/**
 * Each row of the "Without it" table, as the names it accepts.
 *
 * A row is one thing that can be missing, not one string. Some name two
 * variables that must both be set (the Supabase pair), and one names a variable
 * and its older alias, where either will do. So a row is satisfied when the page
 * checks any of its names, and the assertion is per row rather than per name.
 */
function documented(): string[][] {
  const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const table = /\| Variable \| Without it \|([\s\S]*?)\n\n/.exec(readme);
  assert.ok(table, 'the environment table was not found in the README');

  const rows: string[][] = [];
  for (const row of table[1]!.split('\n')) {
    if (!row.startsWith('|')) continue;
    const names = [...(row.split('|')[1]?.matchAll(/`([A-Z_]+)`/g) ?? [])].map((m) => m[1]!);
    if (names.length > 0) rows.push(names);
  }
  return rows;
}

/** Variable names the status page reports on. */
function reported(): Set<string> {
  const page = readFileSync(
    path.join(ROOT, 'src', 'app', 'admin', 'estado', 'page.tsx'),
    'utf8',
  );
  return new Set([...page.matchAll(/label: '([A-Z_]+)'/g)].map((m) => m[1]!));
}

describe('what the deployment page says it is checking', () => {
  const docs = documented();
  const page = reported();

  it('found both lists, so the check below means something', () => {
    assert.ok(docs.length >= 7, `only ${docs.length} rows parsed from the README`);
    assert.ok(page.size >= 8, `only ${page.size} variables reported by the page`);
  });

  /*
   * And the other direction, which nothing asked.
   *
   * The checks below go README to page: everything documented as breaking
   * something is reported somewhere. The reverse can fail too and is quieter. A
   * variable the page checks and the README never mentions gives an operator a
   * red row with no explanation of what it costs them, on the page they were
   * told to read after every step of going live.
   *
   * It holds today, for all eleven. Nothing was keeping it that way.
   */
  it('explains every variable the page reports on', () => {
    const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    const unexplained = [...page].filter((name) => !new RegExp(`\\b${name}\\b`).test(readme));
    assert.deepEqual(
      unexplained,
      [],
      `/admin/estado reports on these and the README never says what breaks without them: ${unexplained.join(', ')}`,
    );
  });

  for (const names of docs) {
    it(`${names.join(' / ')} is reported`, () => {
      assert.ok(
        names.some((n) => page.has(n)),
        `the README says what breaks without ${names.join(' or ')}, and /admin/estado checks ` +
          `none of them. Its "todas puestas" would be true of everything except this.`,
      );
    });
  }
});

/**
 * `npm run doctor` reports on every variable the README says matters, too.
 *
 * The status page and the doctor answer different questions — one for the
 * deployment, one for the machine you are on — and both are only worth running
 * if they cover everything. The doctor has been missing a variable twice:
 * NEXT_PUBLIC_SITE_URL, which decides where the search tool registers and which
 * hostname sign-in may begin on, and ELEVENLABS_WEBHOOK_SECRET, without which a
 * class happens and nothing survives it. Both went unmentioned for dozens of
 * rounds in the tool the README says to run after every step.
 *
 * `ELEVENLABS_AGENT_ID` is referenced through `TEACHER.envKey` rather than as a
 * literal, which is why this resolves that constant instead of grepping for the
 * name: a check that demanded the literal would be asking for noise.
 */
describe('what the doctor says it is checking', () => {
  const docs = documented();
  const doctor = readFileSync(path.join(ROOT, 'scripts', 'doctor.ts'), 'utf8');

  it('found both, so the checks below mean something', () => {
    assert.ok(docs.length >= 7, `only ${docs.length} rows parsed from the README`);
    assert.ok(doctor.length > 5_000, 'doctor.ts looks too small to have been read');
  });

  for (const names of docs) {
    it(`${names.join(' / ')} is checked`, () => {
      assert.ok(
        /*
         * Word-boundary, not substring. `includes` passed a deliberate break
         * where the variable had been renamed to ELEVENLABS_WEBHOOK_SECRET_X,
         * because the original is a prefix of the typo — a guard that accepts
         * the thing it was written to catch.
         */
        names.some((n) => new RegExp(`\\b${n}\\b`).test(doctor) || n === TEACHER.envKey),
        `the README says what breaks without ${names.join(' or ')}, and npm run doctor ` +
          `never mentions it. Somebody following the going-live list would get no signal.`,
      );
    });
  }
});

/*
 * No administrative page is indexable.
 *
 * `/knowledge` was: unlinked from the navigation, gated at the API by
 * INGEST_SECRET, and missing the one line every other admin surface carries. A
 * page headed "Administración" with a secret field was eligible to appear in a
 * search for this product's name. Nothing leaks through it, and that is not the
 * whole of the cost — it invites people to try, and it is the sort of result
 * that makes somebody deciding whether to pay wonder what else is loose.
 *
 * Derived rather than listed: every page under `admin/`, plus any other page
 * whose own copy calls it administration. A new one inherits the rule instead of
 * needing to be remembered.
 */
describe('administrative pages', () => {
  const appDir = path.join(ROOT, 'src', 'app');

  function pages(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'api') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) pages(full, found);
      else if (entry.name === 'page.tsx') found.push(full);
    }
    return found;
  }

  const all = pages(appDir);

  it('found the pages it is meant to check', () => {
    assert.ok(all.length >= 8, `only ${all.length} pages found under src/app`);
  });

  /*
   * And they all refuse an anonymous visitor.
   *
   * `/knowledge` did not. It was open on the reasoning that it holds nothing and
   * every call it makes carries the ingest secret, which is true and left a page
   * headed "Administración" with a secret field on it reachable by anybody. It
   * took a noindex and a robots rule before the obvious answer, and needing two
   * mitigations was the argument for the third.
   */
  it('all refuse an anonymous visitor', () => {
    const open: string[] = [];
    for (const file of all) {
      const source = readFileSync(file, 'utf8');
      const isAdmin =
        file.includes(`${path.sep}admin${path.sep}`) || /Administración/.test(source);
      if (!isAdmin) continue;
      if (!/checkAdmin\(\)/.test(source)) open.push(path.relative(ROOT, file));
    }
    assert.deepEqual(open, [], `administrative pages anybody can open: ${open.join(', ')}`);
  });

  it('are all noindex', () => {
    const leaky: string[] = [];
    for (const file of all) {
      const source = readFileSync(file, 'utf8');
      const isAdmin =
        file.includes(`${path.sep}admin${path.sep}`) || /Administración/.test(source);
      if (!isAdmin) continue;
      if (!/robots:\s*\{[^}]*index:\s*false/.test(source)) leaky.push(path.relative(ROOT, file));
    }
    assert.deepEqual(leaky, [], `administrative pages a search engine may index: ${leaky.join(', ')}`);
  });
});

/*
 * The two files that tell a crawler what to do, and each other.
 *
 * Neither existed, which is not neutral: with no instructions a crawler reads
 * everything it can reach, and `noindex` only takes effect after the page has
 * been fetched. The pair has to agree — a sitemap advertising a page that
 * robots.txt forbids is a contradiction served from one domain, and the one that
 * matters is whichever the crawler happens to trust.
 */
describe('what crawlers are told', () => {
  const read = (file: string) =>
    readFileSync(path.join(ROOT, 'src', 'app', file), 'utf8');

  const disallowed = [...read('robots.ts').matchAll(/'(\/[a-z/]*)'/g)]
    .map((m) => m[1]!)
    .filter((p) => p !== '/');
  const advertised = [...read('sitemap.ts').matchAll(/\$\{origin\}(\/[a-z]*)`/g)].map((m) => m[1]!);

  it('found both files, so the check below means something', () => {
    assert.ok(disallowed.length >= 4, `only ${disallowed.length} disallow rules parsed`);
    assert.ok(advertised.length >= 3, `only ${advertised.length} sitemap entries parsed`);
  });

  it('never advertises a page it also forbids', () => {
    const contradictory = advertised.filter((url) =>
      disallowed.some((rule) => url === rule || (rule.endsWith('/') && url.startsWith(rule))),
    );
    assert.deepEqual(
      contradictory,
      [],
      `the sitemap offers these and robots.txt forbids them: ${contradictory.join(', ')}`,
    );
  });

  it('forbids every page that redirects to a sign-in', () => {
    // A crawler fetching these gets a 307 into a wall, repeatedly, forever.
    for (const gated of ['/coach', '/progreso']) {
      assert.ok(disallowed.includes(gated), `${gated} redirects to sign-in and is not disallowed`);
    }
  });

  /*
   * And every route that is a redirect rather than a page.
   *
   * `/auth/login` answers with a 307 into Supabase's OAuth endpoint. A crawler
   * cannot complete that and will come back tomorrow, so the cost is traffic
   * against the auth provider generated by a robot following a link. It was
   * missing from the first version of this list, which had `/api/` and stopped.
   */
  /*
   * Every route is accounted for by one file or the other.
   *
   * Both lists were written by hand and both turned out incomplete within days:
   * the sitemap missed nothing, and robots.txt shipped without `/auth/`, so a
   * crawler could walk into an OAuth redirect it can never finish. The fix for
   * an incomplete list is not a longer list, it is comparing the list to the
   * thing it describes — and the routes are on disk, so that comparison is
   * available and was simply never made.
   *
   * A route may be advertised or forbidden. What it may not be is neither,
   * because neither is the state nobody notices.
   */
  /*
   * And the manual names every one of them.
   *
   * Five did not, found by comparing the README to the routes on disk: two that
   * are current and load-bearing — the one recording a buy-button press while
   * checkout is unconfigured, and the one receiving the feedback that pays for
   * the first ten plans — and three belonging to a retired subsystem the README
   * had never mentioned at all.
   *
   * That last case is the one worth a test. An undocumented current route costs
   * a maintainer a search. An undocumented retired one costs them a
   * reconstruction: three endpoints and a table filling with forum quotes, and
   * no way to learn why except reading all of it.
   */
  it('is named in the README, every route', () => {
    const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    const appDir = path.join(ROOT, 'src', 'app');

    const handlers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === 'route.ts') {
          handlers.push(`/${path.relative(appDir, dir).split(path.sep).join('/')}`);
        }
      }
    };
    walk(appDir);

    assert.ok(handlers.length > 15, `only ${handlers.length} route handlers found`);

    const undocumented = handlers.filter((route) => !readme.includes(route));
    assert.deepEqual(
      undocumented,
      [],
      `route handlers the manual never names: ${undocumented.join(', ')}`,
    );
  });

  it('accounts for every route in the app', () => {
    const appDir = path.join(ROOT, 'src', 'app');

    const routes: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === 'page.tsx' || entry.name === 'route.ts') {
          const rel = path.relative(appDir, dir).split(path.sep).join('/');
          routes.push(rel === '' ? '/' : `/${rel}`);
        }
      }
    };
    walk(appDir);

    assert.ok(routes.length > 20, `only ${routes.length} routes found`);

    const unaccounted = routes.filter((route) => {
      if (advertised.includes(route)) return false;
      return !disallowed.some(
        (rule) => route === rule || (rule.endsWith('/') && route.startsWith(rule)),
      );
    });

    assert.deepEqual(
      unaccounted,
      [],
      `crawlable and not in the sitemap: ${unaccounted.join(', ')}. Advertise it or forbid it.`,
    );
  });

  it('forbids the routes that only exist to redirect', () => {
    assert.ok(
      disallowed.some((rule) => rule === '/auth/' || rule === '/auth'),
      'a crawler can walk into the OAuth flow and will do it again tomorrow',
    );
  });
});

/*
 * The crawler files skip the session refresh.
 *
 * The middleware matcher excludes static assets because they never carry a
 * session and refreshing on each one multiplies auth traffic by every icon on
 * the page. `robots.txt` and `sitemap.xml` are the same case and were not on the
 * list, because they were added afterwards — and the client that asks for them
 * is a crawler, which has no session and will ask repeatedly.
 *
 * Pinned rather than left to memory: the matcher is one regex read by nobody
 * until it is wrong, and adding a route is exactly when somebody would not think
 * to look at it.
 */
describe('the middleware matcher', () => {
  const source = readFileSync(path.join(ROOT, 'src', 'middleware.ts'), 'utf8');

  it('skips the files a crawler asks for', () => {
    for (const file of ['robots.txt', 'sitemap.xml']) {
      assert.match(
        source,
        new RegExp(file.replace('.', '\\.')),
        `${file} still runs the session refresh on every crawler fetch`,
      );
    }
  });

  it('still runs on the pages that need a session', () => {
    // The exclusion is a negative lookahead; anything that widens it to cover a
    // real page would silently stop refreshing that page's session.
    assert.doesNotMatch(source, /matcher:[\s\S]{0,200}\/coach/);
    assert.doesNotMatch(source, /matcher:[\s\S]{0,200}\/progreso/);
  });
});
