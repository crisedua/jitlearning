/**
 * Thin, typed wrapper over the Apify API — only the surface the pain sweep
 * needs.
 *
 * This is never called from a request handler. An Apify run takes tens of
 * seconds even for a small search (measured: ~37s for the fast actor, and over
 * 90s for the general-purpose one), which is fine for a script and impossible
 * inside a conversation. `scripts/scrape-pains.ts` runs it; the app only ever
 * reads the rows it leaves behind.
 */

const BASE_URL = 'https://api.apify.com/v2';

/**
 * The fast Reddit search actor. The general-purpose scraper is more thorough
 * — it can walk a community and pull comment trees — but it is several times
 * slower, and a sweep that has to be babysat is a sweep that stops being run.
 */
const ACTOR = 'fatihtahta~reddit-scraper-search-fast';

export class ApifyError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Apify ${status}: ${body}`);
    this.name = 'ApifyError';
  }
}

function token(): string {
  const t = process.env.APIFY_TOKEN;
  if (!t) {
    throw new Error(
      'APIFY_TOKEN is not set. Add it to .env.local — see the Apify console under Settings → API & Integrations.',
    );
  }
  return t;
}

/** One post as the actor returns it. Fields beyond these are ignored. */
export interface RedditPost {
  id?: string;
  kind?: string;
  query?: string;
  title?: string;
  body?: string;
  author?: string;
  score?: number;
  num_comments?: number;
  subreddit?: string;
  created_utc?: number | string;
  url?: string;
}

export interface SweepOptions {
  queries: string[];
  /** 'relevance' | 'top' | 'new' | 'comments' */
  sort?: string;
  /** 'hour' | 'day' | 'week' | 'month' | 'year' | 'all' */
  timeframe?: string;
  maxItems?: number;
  /** Seconds to let the run take before giving up on it. */
  timeoutSecs?: number;
}

/**
 * Run one search sweep and return its items.
 *
 * Uses the synchronous endpoint, which blocks until the run finishes and hands
 * back the dataset in the same response — no polling, no run ids to track. The
 * cost is that a slow run ties up the request, hence the explicit timeout.
 */
export async function sweepReddit(opts: SweepOptions): Promise<RedditPost[]> {
  const timeout = opts.timeoutSecs ?? 180;
  const url = new URL(`${BASE_URL}/acts/${ACTOR}/run-sync-get-dataset-items`);
  url.searchParams.set('token', token());
  url.searchParams.set('timeout', String(timeout));

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      queries: opts.queries,
      sort: opts.sort ?? 'relevance',
      timeframe: opts.timeframe ?? 'year',
      maxItems: opts.maxItems ?? 100,
      scrapeComments: false,
    }),
    // Give fetch itself room beyond the actor's own deadline, so a run that
    // ends right at the limit still returns its items instead of aborting.
    signal: AbortSignal.timeout((timeout + 30) * 1000),
  });

  if (!res.ok) throw new ApifyError(res.status, await res.text());
  const data: unknown = await res.json();
  return Array.isArray(data) ? (data as RedditPost[]) : [];
}

/** What the account has spent this month, so a sweep can stop before a surprise. */
export async function monthlySpendUsd(): Promise<{ spent: number; limit: number | null }> {
  const res = await fetch(`${BASE_URL}/users/me/limits?token=${token()}`);
  if (!res.ok) throw new ApifyError(res.status, await res.text());
  const json = (await res.json()) as {
    data?: { current?: { monthlyUsageUsd?: number }; limits?: { maxMonthlyUsageUsd?: number } };
  };
  return {
    spent: json.data?.current?.monthlyUsageUsd ?? 0,
    limit: json.data?.limits?.maxMonthlyUsageUsd ?? null,
  };
}
