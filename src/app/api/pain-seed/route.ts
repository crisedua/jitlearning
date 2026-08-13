/**
 * Load the curated pain signals into the table, from the browser.
 *
 * Exists because the alternative was worse: seeding from a laptop needs the
 * service-role key in a local file, and that key opens every table in the
 * database. Production already holds it for its own writes, so doing the load
 * *there* means the key never has to be copied, pasted or shared to get the
 * radar working.
 *
 * Gated on identity, not a secret — the same list that guards the operator
 * pages. Idempotent: the upsert is keyed on the post URL, so pressing the
 * button twice refreshes the same rows instead of doubling them.
 */
import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/admin';
import { serviceConfigured, supabaseAdmin } from '@/lib/supabase/admin';
import type { PainSignal } from '@/lib/pains';
// Imported rather than read from disk: a file under `scripts/` is not part of
// the deployed bundle, and would be missing exactly where this route runs.
import seed from '@/lib/pains-seed.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const admin = await checkAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      {
        error:
          admin.reason === 'anonymous'
            ? 'Inicia sesión para cargar el radar.'
            : 'Esta acción es solo para el operador.',
      },
      { status: admin.reason === 'anonymous' ? 401 : 403 },
    );
  }

  if (!serviceConfigured()) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY no está configurada en este despliegue.' },
      { status: 503 },
    );
  }

  const signals = seed as PainSignal[];

  const { error, count } = await supabaseAdmin()
    .from('pain_signals')
    .upsert(
      signals.map((s) => ({ ...s, published: true })),
      { onConflict: 'url', ignoreDuplicates: false, count: 'exact' },
    );

  if (error) {
    console.error('[pain-seed] upsert failed:', error.message);
    return NextResponse.json(
      {
        error:
          error.code === '42P01'
            ? 'La tabla pain_signals no existe todavía. Corre la migración primero.'
            : `No se pudo cargar: ${error.message}`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, stored: count ?? signals.length });
}
