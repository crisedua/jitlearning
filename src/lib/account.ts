/**
 * Profiles, plans, and the record of what each learner has used.
 *
 * The split between the two Supabase clients is the whole design here:
 *
 *   reads about yourself → user-scoped client, row-level security applies
 *   writes about usage   → service-role client, because the browser reports
 *                          how long it talked and must not be able to write
 *                          that straight into the ledger
 *
 * Nothing in here throws on a missing table. The schema lives in
 * `supabase/migrations/`, and a deployment that has not run it yet should still
 * serve the coach — degraded to "no usage recorded", not broken.
 */
import type { User } from '@supabase/supabase-js';
import { createClient } from './supabase/server';
import { serviceConfigured, supabaseAdmin } from './supabase/admin';
import { UPGRADE_MARKER } from './gate';
import { expireGrantIfDue } from './grants';
import type { UsageBalance } from './balance';
import { isAdminEmail } from './admin';

export interface Plan {
  id: string;
  name: string;
  /** null means unlimited. Nothing enforces these yet — see `docs` in the README. */
  monthly_minutes: number | null;
  monthly_sessions: number | null;
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  plan_id: string;
}

export interface Account {
  profile: Profile;
  plan: Plan | null;
}

/**
 * Mirror the Google identity into `public.profiles`.
 *
 * A database trigger already does this on first sign-in. This runs on *every*
 * sign-in anyway, for two reasons: it keeps name and avatar current when they
 * change at Google, and it means a deployment whose migration has not been
 * applied to `auth.users` triggers still ends up with profile rows.
 *
 * Best-effort by design — a failure here must not block a sign-in that Supabase
 * already accepted.
 */
export async function syncProfile(user: User): Promise<void> {
  if (!serviceConfigured()) return;

  /*
   * The best-effort promise above, made true against a throw as well.
   *
   * The returned error was handled and a rejection was not, and this is awaited
   * bare in `/auth/callback`, so a rejection here propagates out of the route:
   * the code exchange has already succeeded, and the person is bounced with a
   * 500 instead of being let in. That is the exact trade the comment above says
   * is the wrong one, on the path that gates every other page.
   *
   * Not hypothetical. `supabaseAdmin()` builds its client from
   * NEXT_PUBLIC_SUPABASE_URL, and `createClient` throws outright on a URL with
   * no scheme, which is the ordinary way that value gets pasted wrong and the
   * same mistake that used to stop `npm run doctor` mid-run. One mistyped
   * variable in Vercel would have taken sign-in down for everybody, with the
   * profile mirror as the thing that broke it.
   */
  try {
    await upsertProfile(user);
  } catch (err) {
    console.error('[account] profile upsert threw, sign-in continues:', err);
  }
}

async function upsertProfile(user: User): Promise<void> {
  const meta = user.user_metadata ?? {};
  const { error } = await supabaseAdmin()
    .from('profiles')
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
        full_name: (meta.full_name as string) ?? (meta.name as string) ?? null,
        avatar_url: (meta.avatar_url as string) ?? (meta.picture as string) ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );

  if (error) console.error('[account] profile upsert failed:', error.message);
}

/** The signed-in learner's profile and plan, or null if either is unavailable. */
export async function getAccount(): Promise<Account | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, avatar_url, plan_id, plans(id, name, monthly_minutes, monthly_sessions)')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !data) {
    // No row yet (or no schema). Fall back to the identity we already hold, so
    // the UI can still greet them by name.
    if (error) console.error('[account] profile read failed:', error.message);
    const meta = user.user_metadata ?? {};
    return {
      profile: {
        id: user.id,
        email: user.email ?? null,
        full_name: (meta.full_name as string) ?? (meta.name as string) ?? null,
        avatar_url: (meta.avatar_url as string) ?? (meta.picture as string) ?? null,
        plan_id: 'free',
      },
      plan: null,
    };
  }

  const { plans, ...profile } = data as unknown as Profile & { plans: Plan | Plan[] | null };
  return {
    profile,
    plan: Array.isArray(plans) ? (plans[0] ?? null) : plans,
  };
}

export type { UsageBalance } from './balance';

/**
 * The signed-in learner's month so far, for showing *before* they hit the
 * wall — a limit that is only discovered by hitting it reads as a bug.
 *
 * Read through the user-scoped client on purpose: the `plan_usage` view runs
 * as its caller, so row-level security already scopes it to their own row, and
 * this stays displayable data rather than a second enforcement path. Returns
 * null wherever the view (or Supabase) is unavailable — the caller shows
 * nothing rather than a broken meter.
 */
export async function getUsageBalance(
  userId: string,
  email?: string | null,
): Promise<UsageBalance | null> {
  // Operators are not metered, so showing them a countdown would be a lie —
  // and one they would trust, since it comes from the same view billing does.
  if (isAdminEmail(email)) return null;

  try {
    const supabase = await createClient();

    /*
     * The lifetime view first, and the same way the gate reads it.
     *
     * `plan_usage_total` carries `period`, so one read answers both "how much have
     * they used" and "used within what window". Falling through to `plan_usage`
     * only when this is unavailable keeps the display and the enforcement reading
     * the same numbers — the previous split is what produced a meter that
     * contradicted the wall it was measuring.
     */
    const total = await supabase
      .from('plan_usage_total')
      .select('monthly_minutes, period, minutes, sessions')
      .eq('user_id', userId)
      .maybeSingle();

    if (!total.error && total.data) {
      const row = total.data as {
        monthly_minutes: number | null;
        period: string | null;
        minutes: number;
        sessions: number;
      };
      if (row.period === 'total') {
        return {
          minutes: Number(row.minutes) || 0,
          sessions: Number(row.sessions) || 0,
          monthlyMinutes: row.monthly_minutes,
          monthlySessions: null,
          period: 'total',
        };
      }
    }

    const { data, error } = await supabase
      .from('plan_usage')
      .select('monthly_minutes, monthly_sessions, minutes, sessions')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      if (error) console.error('[account] could not read usage balance:', error.message);
      return null;
    }
    return {
      minutes: Number(data.minutes) || 0,
      sessions: Number(data.sessions) || 0,
      monthlyMinutes: data.monthly_minutes,
      monthlySessions: data.monthly_sessions,
      period: 'month',
    };
  } catch (err) {
    console.error('[account] usage balance lookup failed:', err);
    return null;
  }
}

/**
 * The gate on the month's allowance, read at the single choke point through
 * which every billable conversation passes: minting a signed URL.
 *
 * Checked against the `plan_usage` view, which counts *all* of this month's
 * sessions including browser-reported ones — the generous count, which makes
 * the stricter gate. A NULL limit on the plan means unlimited.
 *
 * Fails open on purpose. A deployment whose migration has not run, or a
 * Supabase hiccup, must degrade to "the coach still answers", not to a wall —
 * the free tier's worst case is a few dollars, and a paying learner locked out
 * by an outage is far worse than a free one let through by it. The check is
 * also only at connection time: a session already running is never cut off,
 * so the cap is soft by roughly one session's length (see docs/pricing.md).
 */
export async function checkPlanAllowance(
  userId: string,
  email?: string | null,
): Promise<{ allowed: true } | { allowed: false; error: string }> {
  /*
   * The fail-open promise above, made unconditional.
   *
   * Every branch inside returns `{ allowed: true }` on a bad read, so the policy
   * held for any error Postgres handed back as a value. It did not hold for one
   * thrown: this is awaited by `/api/signed-url` inside its own try, which turns
   * a rejection into 500 and "no se pudo conectar con el profesor". That is
   * precisely the wall the comment says a Supabase hiccup must never become, and
   * it would land hardest on the paying learner it was written to protect.
   *
   * Not a deadline, deliberately. A slow read that eventually answers still
   * meters correctly, and a timeout that fails open would quietly change how the
   * cap behaves under load, which is a pricing decision rather than a bug fix.
   * A read that hangs long enough still costs the class; that gap is real and
   * left to whoever decides the metering policy.
   */
  try {
    return await allowanceFor(userId, email);
  } catch (err) {
    console.error('[account] allowance check threw, allowing:', err);
    return { allowed: true };
  }
}

async function allowanceFor(
  userId: string,
  email?: string | null,
): Promise<{ allowed: true } | { allowed: false; error: string }> {
  if (!serviceConfigured()) return { allowed: true };

  /*
   * Operators are never metered.
   *
   * Learned the hard way: enforcement went live on a database where the owner
   * had already spent 149 minutes demoing across 48 conversations, and the
   * free tier locked him out of his own product with no way back in. The one
   * account that must always be able to open a session is the one used to show
   * the thing working.
   */
  if (isAdminEmail(email)) return { allowed: true };

  /*
   * A comped plan that has run out ends here, at the moment somebody tries to
   * use it. This is the only choke point every billable conversation passes
   * through, so expiring lazily needs no scheduler and cannot be forgotten in a
   * deploy. Three months free that quietly became forever is the failure this
   * prevents, and it would have been invisible: a granted plan and a paid plan
   * look identical in every other read.
   */
  const grantJustEnded = await expireGrantIfDue(userId);

  /*
   * Which window to count depends on the plan.
   *
   * Free is a lifetime allowance, so counting the calendar month would hand a
   * free learner 20 fresh minutes every 1st and quietly make the tier
   * unlimited. Paid plans reset monthly. `plan_usage_total` carries `period`,
   * so one read answers both.
   */
  const total = await supabaseAdmin()
    .from('plan_usage_total')
    .select('monthly_minutes, period, minutes')
    .eq('user_id', userId)
    .maybeSingle();

  if (!total.error && total.data) {
    const row = total.data as {
      monthly_minutes: number | null;
      period: string | null;
      minutes: number;
    };
    if (row.period === 'total') {
      if (row.monthly_minutes !== null && row.minutes >= row.monthly_minutes) {
        /*
         * Two ways to arrive at the same wall, and they are not the same event.
         *
         * Somebody who tried the free tier and used it up is told what they
         * used. Somebody whose courtesy plan ended a moment ago is not: they
         * spent three months and several hundred minutes, and being told they
         * used the free ones reads as a product that has forgotten them, at
         * the exact moment it is asking to be paid. The grant is what ended, so
         * that is what the sentence says.
         *
         * Only true on the first attempt after expiry, which is the one that
         * matters: `expireGrantIfDue` clears the date as it reverts, so later
         * attempts fall back to the plain message, by which point they have
         * already been told once.
         */
        return {
          allowed: false,
          error: grantJustEnded
            ? `Se acabaron tus meses de cortesía. Lo que mediste sigue en tu página de progreso: para seguir con tus clases, mira los planes${UPGRADE_MARKER}.`
            : `Usaste los ${row.monthly_minutes} minutos gratis. Para seguir con tu plan de clases, mira los planes${UPGRADE_MARKER}.`,
        };
      }
      return { allowed: true };
    }
  }

  const { data, error } = await supabaseAdmin()
    .from('plan_usage')
    .select('monthly_minutes, monthly_sessions, minutes, sessions')
    .eq('user_id', userId)
    .maybeSingle();

  /*
   * Fails open. A deployment whose migration has not run, or a Supabase
   * hiccup, degrades to "the teacher still answers" rather than to a wall: a
   * free learner slipping through costs cents, a paying one locked out by an
   * outage costs trust. The check is also only at connection time, so a
   * session already running is never cut off and the cap stays soft by about
   * one session.
   */
  if (error || !data) {
    if (error) console.error('[account] could not read plan usage, allowing:', error.message);
    return { allowed: true };
  }

  const row = data as {
    monthly_minutes: number | null;
    monthly_sessions: number | null;
    minutes: number;
    sessions: number;
  };

  if (row.monthly_minutes !== null && row.minutes >= row.monthly_minutes) {
    return {
      allowed: false,
      error: `Alcanzaste los ${row.monthly_minutes} minutos de tu plan este mes. El contador vuelve a cero el día 1, o puedes subir de plan${UPGRADE_MARKER}.`,
    };
  }
  if (row.monthly_sessions !== null && row.sessions >= row.monthly_sessions) {
    return {
      allowed: false,
      /*
       * The upgrade is offered here too. This message used to end at "vuelve a
       * cero el día 1", which dead-ends the most motivated person the product
       * ever has: somebody on a paid plan who has used everything it gives and
       * wants more right now. The two minute-based limits both offered a way
       * out; this one told them to wait three weeks.
       */
      error: `Alcanzaste las ${row.monthly_sessions} conversaciones de tu plan este mes. El contador vuelve a cero el día 1, o puedes subir de plan${UPGRADE_MARKER}.`,
    };
  }
  return { allowed: true };
}

/**
 * Open a usage row the moment a signed URL is minted.
 *
 * Written at mint time rather than at connect time on purpose: the credential
 * is billable from the moment it exists, and a learner who closes the tab
 * mid-handshake still cost something. The row starts with only what the server
 * knows; the browser fills in the rest through `finishCoachSession`.
 *
 * Returns the row id, or null when usage recording is not available — the
 * caller must treat that as "carry on without a receipt", never as an error.
 */
export async function startCoachSession(
  userId: string,
  agentId: string,
  coach?: string,
): Promise<string | null> {
  if (!serviceConfigured()) return null;

  const { data, error } = await supabaseAdmin()
    .from('coach_sessions')
    .insert({ user_id: userId, agent_id: agentId, ...(coach ? { coach } : {}) })
    .select('id')
    .single();

  if (error) {
    console.error('[account] could not open usage row:', error.message);
    return null;
  }
  return data.id as string;
}

/**
 * Close a usage row with what the browser observed.
 *
 * These numbers are a first approximation: the browser can lie, and a closed
 * laptop reports nothing at all. `npm run sync:usage` later overwrites them
 * with ElevenLabs' own accounting, which is what any billing decision should
 * ever be based on.
 *
 * Scoped to `user_id` so a learner can only ever close their own row, even
 * though the write itself runs with the service role.
 */
export async function finishCoachSession(
  sessionId: string,
  userId: string,
  patch: { conversationId?: string; durationSeconds?: number; messageCount?: number },
): Promise<void> {
  if (!serviceConfigured()) return;

  const { error, count } = await supabaseAdmin()
    .from('coach_sessions')
    .update(
      {
        conversation_id: patch.conversationId ?? null,
        duration_seconds: patch.durationSeconds ?? null,
        message_count: patch.messageCount ?? null,
        ended_at: new Date().toISOString(),
      },
      { count: 'exact' },
    )
    .eq('id', sessionId)
    .eq('user_id', userId);

  if (error) console.error('[account] could not close usage row:', error.message);
  /*
   * Two filters, so matching nothing means the row is gone or belongs to
   * somebody else, and neither is an error. This row is what carries the
   * conversation id the post-call webhook matches on and the duration the
   * allowance is counted from, so losing it quietly costs both the memory of
   * the class and the minutes it used.
   */
  else if (count === 0) {
    console.error(`[account] session ${sessionId} not closed: no row for that user`);
  }
}

/**
 * When this learner last spoke to the teacher, or null if they never have.
 *
 * `/progreso` renders its empty state from the absence of a career profile, and
 * that profile is written by the post-call webhook, which fires after the call
 * ends. So somebody who finishes their first class and follows the link the
 * classroom offers arrives in the gap: the class happened, nothing is written
 * yet, and the page told them "todavía no hay nada acá, esta página se llena en
 * tu primera clase".
 *
 * That is the worst sentence available at that moment. They did the work, they
 * clicked the thing that said their plan was here, and the product answered that
 * it had not met them.
 *
 * A session row exists from the moment the microphone opens, so it can tell the
 * two apart: never been here, or been here minutes ago and waiting on a webhook.
 */
export async function lastSessionAt(userId: string): Promise<Date | null> {
  if (!serviceConfigured()) return null;

  try {
    const { data, error } = await supabaseAdmin()
      .from('coach_sessions')
      .select('started_at')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    const when = new Date((data as { started_at: string }).started_at);
    return Number.isNaN(when.getTime()) ? null : when;
  } catch {
    // An empty state that is merely generic beats a page that will not render.
    return null;
  }
}
