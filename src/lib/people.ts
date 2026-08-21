/**
 * Who is using this, and what it is doing for them.
 *
 * The operator pages answer money (`/admin/costos`), funnel (`/admin/embudo`)
 * and deployment (`/admin/estado`), and none of them answers "who has an
 * account". That question was only reachable through the Supabase dashboard,
 * where an account is a row in `auth.users` with no plan beside it, no minutes
 * and no sign of whether the product has ever worked for that person.
 *
 * Read-only on purpose. Granting a plan already has a place — the feedback page,
 * where the promise being honoured is written next to the button — and a second
 * surface that can change somebody's plan is a second surface that can get it
 * wrong. This one exists to be looked at.
 */
import { serviceConfigured, supabaseAdmin } from './supabase/admin';

/**
 * A ceiling on one page load.
 *
 * `listUsers` pages rather than filters, so without this the page grows a
 * request per two hundred accounts forever. Two thousand is far past this
 * product's size and small enough that the page stays a page; past it the count
 * is reported rather than silently cut, because a truncated list of customers
 * that looks complete is worse than a short one that says so.
 */
const MAX_ACCOUNTS = 2_000;
const PER_PAGE = 200;

export interface Learner {
  id: string;
  email: string;
  /** When they signed in for the first time. */
  joinedAt: string;
  lastSeenAt: string | null;
  planId: string;
  /** Set when the plan was given rather than bought. */
  grantedUntil: string | null;
  subscriptionStatus: string | null;
  minutesThisMonth: number;
  classes: number;
  lastClassAt: string | null;
  /**
   * Whether any class of theirs has its words stored.
   *
   * Here because of what it caught: a missing webhook secret had every
   * post-call delivery refused for days, so classes happened and left nothing
   * behind. From the outside that is invisible — the sessions are recorded and
   * billed either way. A person with classes and no transcripts is the shape of
   * that failure, per person, which is where it is noticed.
   */
  hasTranscripts: boolean;
}

export interface People {
  learners: Learner[];
  /** True when `MAX_ACCOUNTS` was reached, so the list is not everybody. */
  truncated: boolean;
}

export async function listLearners(): Promise<People | null> {
  if (!serviceConfigured()) return null;

  const db = supabaseAdmin();

  /*
   * Accounts first, because `auth.users` is the only place an email lives.
   * `profiles` is keyed on the same id but carries no address, so a page built
   * from profiles alone would list plans belonging to nobody nameable.
   */
  const accounts: { id: string; email: string; joinedAt: string; lastSeenAt: string | null }[] = [];
  let truncated = false;

  for (let page = 1; accounts.length < MAX_ACCOUNTS; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) {
      console.error('[people] could not list accounts:', error.message);
      return null;
    }

    for (const user of data.users) {
      if (!user.email) continue;
      accounts.push({
        id: user.id,
        email: user.email,
        joinedAt: user.created_at,
        lastSeenAt: user.last_sign_in_at ?? null,
      });
    }

    if (data.users.length < PER_PAGE) break;
    if (accounts.length >= MAX_ACCOUNTS) truncated = true;
  }

  const ids = accounts.map((a) => a.id);
  if (ids.length === 0) return { learners: [], truncated };

  /*
   * Four reads rather than four hundred.
   *
   * Every one of these is a single query filtered by the whole id list, and the
   * joining happens here. The alternative — a query per learner — turns an
   * operator page into a hundred round trips the first time this product has a
   * hundred customers.
   */
  const [profiles, usage, sessions, transcripts] = await Promise.all([
    db.from('profiles').select('id, plan_id, plan_granted_until, subscription_status').in('id', ids),
    db.from('plan_usage').select('user_id, minutes').in('user_id', ids),
    db.from('coach_sessions').select('user_id, started_at').in('user_id', ids),
    db.from('session_transcripts').select('user_id').in('user_id', ids),
  ]);

  const planBy = new Map<string, { plan: string; until: string | null; status: string | null }>();
  for (const row of (profiles.data ?? []) as Record<string, unknown>[]) {
    planBy.set(row.id as string, {
      plan: (row.plan_id as string) ?? 'free',
      until: (row.plan_granted_until as string) ?? null,
      status: (row.subscription_status as string) ?? null,
    });
  }

  const minutesBy = new Map<string, number>();
  for (const row of (usage.data ?? []) as Record<string, unknown>[]) {
    minutesBy.set(row.user_id as string, Number(row.minutes) || 0);
  }

  const classesBy = new Map<string, { count: number; last: string | null }>();
  for (const row of (sessions.data ?? []) as Record<string, unknown>[]) {
    const id = row.user_id as string;
    const at = row.started_at as string;
    const seen = classesBy.get(id);
    classesBy.set(id, {
      count: (seen?.count ?? 0) + 1,
      last: !seen?.last || at > seen.last ? at : seen.last,
    });
  }

  const withWords = new Set(
    ((transcripts.data ?? []) as { user_id: string }[]).map((r) => r.user_id),
  );

  const learners = accounts.map((account) => {
    const plan = planBy.get(account.id);
    const classes = classesBy.get(account.id);
    return {
      ...account,
      planId: plan?.plan ?? 'free',
      grantedUntil: plan?.until ?? null,
      subscriptionStatus: plan?.status ?? null,
      minutesThisMonth: minutesBy.get(account.id) ?? 0,
      classes: classes?.count ?? 0,
      lastClassAt: classes?.last ?? null,
      hasTranscripts: withWords.has(account.id),
    } satisfies Learner;
  });

  // Newest first: on an operator page the row somebody is looking for is almost
  // always the person who just signed up.
  learners.sort((a, b) => b.joinedAt.localeCompare(a.joinedAt));

  return { learners, truncated };
}
