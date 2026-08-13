/**
 * The one write path into `pain_signals`, shared by every producer — the
 * Apify sweep, the LLM radar, and the seed loader.
 *
 * Separate from `pains.ts` on purpose: that module is deliberately I/O-free
 * (its header promises "nothing here scrapes"), and keeping the service-role
 * client out of it means it can never be dragged toward a client bundle.
 *
 * Rows land `published = true` because every producer filters before calling:
 * the sweep's mechanical gates, the radar's scoring gate plus URL check, the
 * seed's hand curation. If a producer without a filter ever appears, flip its
 * rows to false and publish by hand — a learner seeing noise dressed as
 * evidence is the failure worth avoiding.
 */
import type { PainSignal } from './pains';
import { serviceConfigured, supabaseAdmin } from './supabase/admin';

export async function storePainSignals(
  signals: PainSignal[],
  opts: { dry?: boolean } = {},
): Promise<{ stored: number; error: string | null }> {
  if (opts.dry || signals.length === 0) return { stored: 0, error: null };
  if (!serviceConfigured()) {
    return { stored: 0, error: 'SUPABASE_SERVICE_ROLE_KEY no está configurada aquí.' };
  }

  // Upsert on the URL: the same thread resurfacing in a later run should
  // refresh its row, not accumulate a second one.
  const { error, count } = await supabaseAdmin()
    .from('pain_signals')
    .upsert(
      signals.map((s) => ({ ...s, published: true })),
      { onConflict: 'url', ignoreDuplicates: false, count: 'exact' },
    );

  if (error) {
    return {
      stored: 0,
      error:
        error.code === '42P01'
          ? 'La tabla pain_signals no existe todavía. Corre la migración 20260807000000_pain_signals.sql.'
          : error.message,
    };
  }
  return { stored: count ?? signals.length, error: null };
}
