/**
 * The operator's cost dashboard.
 *
 * Answers one question: what does running this cost, and what would it cost at
 * a different size. Four providers, two of which scale with spoken minutes and
 * two of which do not — the arithmetic is in `src/lib/costs.ts` and the prose
 * behind every default is in `docs/pricing.md`.
 *
 * Not linked from anywhere. It is reachable by typing the address, gated on the
 * signed-in identity, and marked `noindex` — but the gate is what protects it,
 * not the obscurity.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CostProjector, type LiveUsage } from '@/components/CostProjector';
import { checkAdmin } from '@/lib/admin';
import { signInPath } from '@/lib/paths';
import { serviceConfigured, supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Never cached, never prerendered. A cached page here would show one
 * administrator's figures to the next request, and figures that are stale by a
 * revalidation window are worse than useless on a page whose whole purpose is
 * to reflect the current month.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Costos · ModoJIT',
  robots: { index: false, follow: false },
};

/**
 * How much traffic to aggregate in one page load.
 *
 * Deliberately a constant with a name rather than a magic number: past this,
 * the totals below silently become "the most recent N sessions" instead of
 * "the month", which is the kind of quiet wrongness a cost page must not have.
 * The page says so when the cap is hit. At that volume this should move to a
 * SQL aggregate.
 */
const MAX_SESSIONS_SCANNED = 10_000;

/**
 * This calendar month, everyone, from the ledger.
 *
 * Service-role rather than the user-scoped client on purpose: this is a
 * cross-tenant aggregate, which row-level security is specifically there to
 * prevent. The admin gate above is what authorises it, and it runs after that
 * gate rather than before.
 *
 * The month boundary is UTC, to match `date_trunc('month', now())` in the
 * `plan_usage` view — two different month starts on the same page would be a
 * bug nobody could see.
 */
async function loadLiveUsage(): Promise<LiveUsage> {
  const empty: LiveUsage = {
    activeUsers: 0,
    totalUsers: 0,
    minutes: 0,
    syncedMinutes: 0,
    sessions: 0,
    available: false,
  };

  if (!serviceConfigured()) return empty;

  try {
    const db = supabaseAdmin();
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString();

    const [profiles, sessions] = await Promise.all([
      db.from('profiles').select('id', { count: 'exact', head: true }),
      db
        .from('coach_sessions')
        .select('user_id, duration_seconds, usage_synced_at')
        .gte('started_at', monthStart)
        .limit(MAX_SESSIONS_SCANNED),
    ]);

    if (sessions.error) {
      console.error('[admin/costos] could not read sessions:', sessions.error.message);
      return empty;
    }

    const rows = (sessions.data ?? []) as {
      user_id: string;
      duration_seconds: number | null;
      usage_synced_at: string | null;
    }[];

    let seconds = 0;
    let syncedSeconds = 0;
    const talkers = new Set<string>();

    for (const row of rows) {
      // A session still running, or one whose browser never reported back, has
      // no duration. It counts as a conversation and contributes no minutes —
      // the same asymmetry the learner's own balance has.
      const duration = row.duration_seconds ?? 0;
      seconds += duration;
      if (row.usage_synced_at) syncedSeconds += duration;
      talkers.add(row.user_id);
    }

    return {
      activeUsers: talkers.size,
      totalUsers: profiles.count ?? talkers.size,
      minutes: seconds / 60,
      syncedMinutes: syncedSeconds / 60,
      sessions: rows.length,
      available: true,
    };
  } catch (err) {
    console.error('[admin/costos] usage aggregate failed:', err);
    return empty;
  }
}

export default async function CostosPage() {
  const gate = await checkAdmin();

  if (!gate.ok && gate.reason === 'anonymous') {
    redirect(signInPath('/admin/costos'));
  }

  /*
   * Signed in as somebody else. Say so rather than 404ing: a wrong-account
   * mistake is far more likely here than an attack, and "not found" would send
   * the owner hunting for a broken link instead of switching accounts. The
   * page's contents are not disclosed either way.
   */
  if (!gate.ok) {
    return (
      <section className="mx-auto max-w-[75rem] px-6 py-24">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Restringido</p>
        <h1 className="mt-4 max-w-[20ch] font-serif text-[clamp(2rem,4.5vw,3rem)] font-normal leading-[1.08] tracking-[-0.02em]">
          Esta página es solo para quien administra el sitio
        </h1>
        <p className="mt-5 max-w-[58ch] text-[17px] leading-relaxed text-muted">
          {gate.email
            ? `Estás con la cuenta ${gate.email}, que no tiene acceso. Si tienes otra, entra con esa.`
            : 'La cuenta con la que entraste no tiene acceso.'}
        </p>
        <Link
          href="/coach"
          className="mt-8 inline-flex items-center rounded-full border border-line-strong px-5 py-2.5 text-[15px] font-medium text-ink transition hover:border-accent hover:text-accent"
        >
          Ir al coach
        </Link>
      </section>
    );
  }

  const live = await loadLiveUsage();
  const capped = live.sessions >= MAX_SESSIONS_SCANNED;

  return (
    <section className="mx-auto max-w-[75rem] px-6 pb-24 pt-16">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Administración</p>
      <h1 className="mt-4 max-w-[24ch] font-serif text-[clamp(2rem,4.5vw,3.25rem)] font-normal leading-[1.08] tracking-[-0.02em]">
        Qué cuesta operar el profesor
      </h1>
      <p className="mt-5 max-w-[62ch] text-[17px] leading-relaxed text-muted">
        Cuatro proveedores. Dos escalan con los minutos hablados y dos son fijos. Todos los supuestos
        son editables, porque todos son estimaciones hasta que haya un mes de tráfico real detrás.
      </p>
      <p className="mt-3 text-[13px] text-soft">
        Entraste como <span className="font-mono">{gate.email}</span>.
      </p>

      {capped && (
        <p className="mt-6 max-w-[62ch] rounded-lg border border-warning/35 bg-warning-soft/50 px-4 py-3 text-[14px] leading-relaxed text-ink/80">
          Se alcanzó el tope de {MAX_SESSIONS_SCANNED.toLocaleString('es-CL')} conversaciones leídas
          en una carga. Los totales de «este mes» están recortados y son un piso, no la cifra real.
        </p>
      )}

      <div className="mt-12">
        <CostProjector live={live} />
      </div>

      <p className="mt-14 max-w-[75ch] border-t border-line pt-6 text-[13px] leading-relaxed text-soft">
        El detalle de cómo se derivó cada número —y qué pasa si ElevenLabs cachea el prompt de
        sistema, que abarataría la inferencia a menos de la mitad— está en{' '}
        <code className="font-mono text-[12px]">docs/pricing.md</code>. Los precios de venta viven en
        la tabla <code className="font-mono text-[12px]">plans</code> y se muestran en{' '}
        <Link href="/planes" className="text-accent underline underline-offset-2">
          /planes
        </Link>
        .
      </p>
    </section>
  );
}
