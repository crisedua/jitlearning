import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SeedRadarButton } from '@/components/SeedRadarButton';
import { RadarLlmButton } from '@/components/RadarLlmButton';
import { openaiConfigured } from '@/lib/openai';
import { checkAdmin } from '@/lib/admin';
import { signInPath } from '@/lib/paths';
import { serviceConfigured, supabaseAdmin } from '@/lib/supabase/admin';
import seed from '@/lib/pains-seed.json';

/**
 * The radar's operator page: what the coach can currently find, and a button
 * to load the curated signals.
 *
 * Not linked from anywhere, gated on identity, and `noindex` — same treatment
 * as the cost dashboard. The gate is what protects it, not the obscurity.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Radar de dolores · ModoJIT',
  robots: { index: false, follow: false },
};

interface Row {
  title: string;
  community: string | null;
  country: string | null;
  captured_at: string;
}

/** What is in the table right now, grouped the way the coach queries it. */
async function currentRows(): Promise<{ rows: Row[]; error: string | null }> {
  if (!serviceConfigured()) {
    return { rows: [], error: 'SUPABASE_SERVICE_ROLE_KEY no está configurada aquí.' };
  }
  const { data, error } = await supabaseAdmin()
    .from('pain_signals')
    .select('title, community, country, captured_at')
    .eq('published', true)
    .order('captured_at', { ascending: false })
    .limit(100);

  if (error) {
    return {
      rows: [],
      error:
        error.code === '42P01'
          ? 'La tabla pain_signals no existe todavía. Corre la migración 20260807000000_pain_signals.sql.'
          : error.message,
    };
  }
  return { rows: (data ?? []) as Row[], error: null };
}

export default async function RadarAdminPage() {
  const admin = await checkAdmin();
  if (!admin.ok && admin.reason === 'anonymous') redirect(signInPath('/admin/radar'));

  if (!admin.ok) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20">
        <h1 className="font-serif text-[28px] font-normal">Restringido</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-muted">
          Entraste como {admin.email ?? 'otra cuenta'}. Esta página es solo para el operador.
        </p>
        <Link href="/coach" className="mt-6 inline-block text-accent underline underline-offset-2">
          Ir a los coaches
        </Link>
      </div>
    );
  }

  const { rows, error } = await currentRows();
  const byCountry = rows.reduce<Record<string, number>>((acc, r) => {
    const key = r.country ?? 'sin país';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-14">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Operador</p>
        <h1 className="mt-3 font-serif text-[clamp(1.9rem,4vw,2.5rem)] font-normal leading-tight tracking-[-0.02em]">
          Radar de dolores
        </h1>
        <p className="mt-3 max-w-[60ch] text-[16px] leading-relaxed text-muted">
          Lo que el coach de emprendedores puede encontrar cuando alguien le pregunta de qué se
          queja la gente. El botón carga las {(seed as unknown[]).length} señales curadas de los
          barridos ya hechos; se puede apretar las veces que quieras, porque cada fila se
          identifica por su enlace y se actualiza en vez de duplicarse.
        </p>
      </header>

      {error ? (
        <p className="rounded-md border border-warning/30 bg-warning-soft/50 px-4 py-3 text-sm leading-relaxed text-ink/85">
          {error}
        </p>
      ) : (
        <div className="rounded-lg border border-line bg-surface p-6">
          <p className="font-mono text-[32px] font-medium leading-none tracking-[-0.02em]">
            {rows.length}
          </p>
          <p className="mt-1.5 text-[15px] text-muted">
            señal(es) publicadas
            {rows.length > 0 && (
              <>
                {' · '}
                {Object.entries(byCountry)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(' · ')}
              </>
            )}
          </p>
        </div>
      )}

      <section className="space-y-3 rounded-lg border border-line bg-surface p-6">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          Buscar dolores nuevos
        </h2>
        <RadarLlmButton disponible={openaiConfigured()} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          Semilla curada
        </h2>
        <SeedRadarButton count={rows.length} />
      </section>

      {rows.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            En el radar
          </h2>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {rows.map((r) => (
              <li key={r.title} className="flex flex-wrap items-baseline gap-x-3 py-2.5">
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-soft">
                  {[r.community, r.country].filter(Boolean).join(' · ')}
                </span>
                <span className="flex-1 text-[15px] leading-snug text-ink/85">{r.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[13px] leading-relaxed text-soft">
        Dos formas de alimentar el radar: el botón de arriba (o{' '}
        <code className="font-mono">npm run radar</code>) usa IA con búsqueda web y cuesta
        centavos por corrida; <code className="font-mono">npm run scrape:pains</code> barre Reddit
        vía Apify y consume su crédito mensual. Ambos escriben en la misma tabla y el coach no
        distingue el origen.
      </p>
    </div>
  );
}
