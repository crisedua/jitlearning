/**
 * The plan the product offers when it asks to be paid.
 *
 * One reader, used by the offer block on `/progreso`. It exists so that block can
 * quote a real price and a real allowance instead of hardcoding them: the pricing
 * page has always read `plans` at request time precisely so a price change is a
 * row update rather than a deploy, and an offer that hardcodes the number would
 * start lying the first time somebody used that.
 *
 * Returns null when the recommended plan is missing, not public, or the database
 * is unreachable. The caller renders no offer at all in that case, which is the
 * right failure: a broken price is worse than no ask.
 */
import { createClient } from '@supabase/supabase-js';
import { anonKey, authConfigured, supabaseUrl } from './supabase/env';
import {
  FALLBACK_PLANS,
  PLAN_COLUMNS,
  RECOMMENDED_PLAN_ID,
  rowToPlan,
  type Plan,
} from './plans';
import { withDeadline } from './deadline';

/**
 * The compiled row for the plan we recommend.
 *
 * Correct on price, name and allowance, and carrying no `stripe_price_id`, which
 * is what makes it safe: `/progreso` decides a plan is buyable from that column,
 * so a fallback offer degrades to the prefilled message instead of opening a
 * checkout against a price nobody confirmed.
 */
const COMPILED = FALLBACK_PLANS.find((p) => p.id === RECOMMENDED_PLAN_ID) ?? null;

/** Long enough for a healthy read, short enough that a notebook still renders. */
const DEADLINE_MS = 2_000;

export async function recommendedPlan(): Promise<Plan | null> {
  /*
   * Never null while a plan exists to name.
   *
   * `/progreso` shows the offer only when this returns something, so every way
   * this answered null was a way for somebody who finished a task and measured
   * their hours to never be asked to pay: an unconfigured environment, a
   * transient error, a missing anon read policy on `plans`, a slow read.
   *
   * That is the third door into the same room. The first was a missing billing
   * migration and the second was a learner with no profile row, and both were
   * closed one at a time without anybody asking what else gates this.
   *
   * The compiled row is the same fallback the pricing page uses for the same
   * reason, and it is better than silence in every case: the price it quotes is
   * the price this repo ships, and the button it produces writes to a person
   * rather than opening a checkout.
   */
  return withDeadline(read(), COMPILED, DEADLINE_MS).then((plan) => plan ?? COMPILED);
}

async function read(): Promise<Plan | null> {
  if (!authConfigured()) return null;

  try {
    // The anon client, like the pricing page: `plans` is public data, and reading
    // it with the service role here would grant more than the page needs.
    const supabase = createClient(supabaseUrl(), anonKey(), {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from('plans')
      .select(PLAN_COLUMNS)
      .eq('id', RECOMMENDED_PLAN_ID)
      .eq('is_public', true)
      .maybeSingle();

    if (error || !data) return null;
    return rowToPlan(data as Parameters<typeof rowToPlan>[0]);
  } catch {
    return null;
  }
}
