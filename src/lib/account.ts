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

export interface UsageBalance {
  /** Minutes and sessions spent this calendar month, including unreconciled rows. */
  minutes: number;
  sessions: number;
  /** The plan's limits; null = unlimited. */
  monthlyMinutes: number | null;
  monthlySessions: number | null;
}

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
        return {
          allowed: false,
          error: `Usaste los ${row.monthly_minutes} minutos gratis. Para seguir con tu plan de clases, mira los planes en /planes.`,
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
      error: `Alcanzaste los ${row.monthly_minutes} minutos de tu plan este mes. El contador vuelve a cero el día 1, o puedes subir de plan en /planes.`,
    };
  }
  if (row.monthly_sessions !== null && row.sessions >= row.monthly_sessions) {
    return {
      allowed: false,
      error: `Alcanzaste las ${row.monthly_sessions} conversaciones de tu plan este mes. El contador vuelve a cero el día 1.`,
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

  const { error } = await supabaseAdmin()
    .from('coach_sessions')
    .update({
      conversation_id: patch.conversationId ?? null,
      duration_seconds: patch.durationSeconds ?? null,
      message_count: patch.messageCount ?? null,
      ended_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('user_id', userId);

  if (error) console.error('[account] could not close usage row:', error.message);
}

/**
 * Remember which coach this learner opened, so the picker preselects it.
 *
 * On the profile rather than in a cookie: someone who studies on a phone at
 * lunch and a laptop at night should not have to choose twice. Best effort,
 * and deliberately not awaited for its result at the call site — a failed
 * preference write must never cost somebody their session.
 */
export async function rememberCoachChoice(userId: string, coach: string): Promise<void> {
  if (!serviceConfigured()) return;

  const { error } = await supabaseAdmin()
    .from('profiles')
    .update({ last_coach: coach })
    .eq('id', userId);

  // 42703: the study_memory migration has not run here. Not worth a log line
  // on every connect.
  if (error && error.code !== '42703') {
    console.error('[account] could not store coach choice:', error.message);
  }
}

/** The coach this learner opened last, or null. Drives the picker's preselection. */
export async function lastCoachChoice(userId: string): Promise<string | null> {
  if (!serviceConfigured()) return null;

  const { data, error } = await supabaseAdmin()
    .from('profiles')
    .select('last_coach')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return (data as { last_coach: string | null }).last_coach ?? null;
}
