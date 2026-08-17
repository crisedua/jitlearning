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
import { PLAN_COLUMNS, RECOMMENDED_PLAN_ID, rowToPlan, type Plan } from './plans';

export async function recommendedPlan(): Promise<Plan | null> {
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
