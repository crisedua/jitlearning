/**
 * The pricing page: one plan, Empresa, presented full-width.
 *
 * The individual tiers still exist in the `plans` table and keep their prices —
 * they are what the app will enforce limits against — but they are no longer
 * offered on this page. What is for sale here is one thing: an organisation's
 * own coach, on its own domain, trained on its own material.
 *
 * The price is still read from Postgres at request time rather than compiled
 * in, so changing it is a row update instead of a deploy. `src/lib/plans.ts`
 * holds the card copy and a fallback copy of the figures for when the database
 * cannot be reached.
 *
 * There is no checkout, because there is no payment integration: the plan is
 * sold, not bought, and the button writes to a person.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { anonKey, authConfigured, supabaseUrl } from '@/lib/supabase/env';
import { PROFILE } from '@/lib/site';
import {
  FALLBACK_PLANS,
  PLAN_COLUMNS,
  PLAN_FEATURES,
  formatMinutes,
  formatMoney,
  formatOverage,
  rowToPlan,
  type Plan,
} from '@/lib/plans';

export const metadata: Metadata = {
  title: 'Plan Empresa · ModoJIT',
  description:
    'Su propio coach de IA: entrenado con el material de su empresa o colegio, en su propio dominio. US$1.500 de implementación y un precio mensual por persona.',
};

/** Prices change without a deploy, so the page must not be cached forever. */
export const revalidate = 300;

const EMPRESA_ID = 'empresa';

/**
 * The Empresa plan, from Postgres when it is available.
 *
 * Deliberately *not* the cookie-bound client from `src/lib/supabase/server.ts`.
 * That one exists to act as the signed-in learner, and touching cookies would
 * opt this page out of static rendering — so a public price would hit Postgres
 * on every request for a row that is identical for everyone. A plain anon
 * client keeps the page on the revalidation schedule above.
 *
 * Falls back to the compiled copy on any failure — unconfigured environment,
 * network error, a missing row, or the pre-migration state where the columns
 * this query names do not exist yet. The fallback logs: silently serving a
 * stale price is exactly the failure a pricing page cannot afford.
 */
async function loadEmpresa(): Promise<Plan> {
  const fallback = FALLBACK_PLANS.find((p) => p.id === EMPRESA_ID)!;
  if (!authConfigured()) return fallback;

  try {
    const supabase = createClient(supabaseUrl(), anonKey(), {
      // No user to keep signed in, and no cookie jar to read one from.
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase
      .from('plans')
      .select(PLAN_COLUMNS)
      .eq('id', EMPRESA_ID)
      .maybeSingle();

    if (error || !data) {
      console.error(
        '[planes] could not read the empresa plan, showing the compiled price:',
        error?.message ?? 'row not found',
      );
      return fallback;
    }
    return rowToPlan(data);
  } catch (err) {
    console.error('[planes] plan lookup failed, showing the compiled price:', err);
    return fallback;
  }
}

/** A checkmark. Decorative — the list item's text carries the meaning. */
function Check() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="18"
      height="18"
      aria-hidden
      focusable="false"
      fill="none"
      className="mt-[3px] shrink-0"
    >
      <path
        d="M3 8.5 6.2 11.5 13 4.5"
        className="stroke-accent"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function PlanesPage() {
  const plan = await loadEmpresa();
  const features = PLAN_FEATURES[plan.id] ?? [];
  const subject = encodeURIComponent(`Plan ${plan.name}`);

  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="mx-auto max-w-[75rem] px-6 pb-14 pt-20 lg:pt-24">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
          Plan Empresa
        </p>
        <h1 className="mt-4 max-w-[24ch] font-serif text-[clamp(2.25rem,5vw,3.75rem)] font-normal leading-[1.04] tracking-[-0.02em]">
          Su propio coach, con{' '}
          <span className="relative inline-block">
            su material
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-[0.1em] -z-10 h-[0.32em] bg-gold-soft"
            />
          </span>
          , en su dominio
        </h1>
        <p className="mt-6 max-w-[62ch] text-[17px] leading-relaxed text-muted">
          Para una empresa o un colegio. Nosotros lo montamos, lo entrenamos con sus documentos
          — políticas, procesos, protocolos — y lo mantenemos; ustedes deciden qué sabe y quién
          le pregunta.
        </p>
      </section>

      {/* ------------------------------------------------------------ The plan */}
      <section className="mx-auto max-w-[75rem] px-6 pb-20">
        <div className="reveal rounded-xl border border-line bg-surface-alt p-8 sm:p-12 lg:p-14">
          <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <h2 className="font-serif text-[clamp(1.75rem,3vw,2.25rem)] font-normal leading-[1.1] tracking-[-0.02em]">
                Qué incluye
              </h2>
              <ul className="mt-7 flex flex-col gap-3.5 text-[16px] leading-relaxed text-muted">
                {features.map((feature) => (
                  <li key={feature} className="flex gap-3">
                    <Check />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <p className="mt-8 max-w-[58ch] border-t border-line pt-6 text-[15px] leading-relaxed text-soft">
                La implementación cubre el trabajo que pasa antes del primer minuto hablado:
                reunir y depurar el material, entrenar y probar el coach con preguntas reales de
                su gente, ajustar su forma de responder, y dejarlo publicado en su dominio con
                acceso solo para su organización.
              </p>
            </div>

            <div className="lg:border-l lg:border-line lg:pl-16">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-soft">
                Implementación
              </p>
              <p className="mt-2 flex items-baseline gap-1.5">
                <span className="font-mono text-[34px] font-medium leading-none tracking-[-0.02em] text-ink">
                  {plan.setupMinor !== null ? formatMoney(plan.setupMinor, plan.currency) : '—'}
                </span>
                <span className="text-[15px] text-soft">por una vez</span>
              </p>

              <p className="mt-8 text-xs font-semibold uppercase tracking-[0.14em] text-soft">
                Mensualidad
              </p>
              <p className="mt-2 flex items-baseline gap-1.5">
                <span className="font-mono text-[34px] font-medium leading-none tracking-[-0.02em] text-ink">
                  {formatMoney(plan.priceMinor, plan.currency)}
                </span>
                <span className="text-[15px] text-soft">/persona al mes</span>
              </p>
              {plan.seatMinimum && (
                <p className="mt-1.5 text-[14px] text-soft">desde {plan.seatMinimum} personas</p>
              )}

              <p className="mt-6 text-[16px] font-medium text-ink">
                {formatMinutes(plan.monthlyMinutes)} de conversación por persona
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-soft">{formatOverage(plan)}</p>

              {PROFILE.email ? (
                <a
                  href={`mailto:${PROFILE.email}?subject=${subject}`}
                  className="mt-9 inline-flex w-full items-center justify-center rounded-full bg-accent px-6 py-3 text-[16px] font-medium text-bg transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-hover"
                >
                  Conversemos
                </a>
              ) : (
                <p className="mt-9 rounded-full border border-dashed border-line-strong px-5 py-2.5 text-center text-[15px] text-soft">
                  Disponible pronto
                </p>
              )}
              <p className="mt-3 text-center text-[13px] text-soft">
                Precios en dólares, sin IVA.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/*
        The question every metered product gets asked, answered before anyone
        has to ask it. Each claim here is one the code actually makes true — see
        the `plan_usage` view and `scripts/sync-usage.ts`.
      */}
      <section className="border-t border-line bg-surface-alt py-20 lg:py-24">
        <div className="mx-auto max-w-[75rem] px-6">
          <p className="reveal text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            Cómo se cuentan
          </p>
          <h2 className="reveal mt-4 max-w-[24ch] font-serif text-[clamp(2rem,4.5vw,3rem)] font-normal leading-[1.08] tracking-[-0.02em]">
            Qué cuenta como un minuto
          </h2>

          <dl className="mt-12 grid gap-x-12 gap-y-9 md:grid-cols-2">
            <div className="reveal">
              <dt className="text-[17px] font-medium text-ink">
                El tiempo de la conversación, no las preguntas
              </dt>
              <dd className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-muted">
                Se mide desde que se abre la conexión hasta que se cierra. Preguntar cinco cosas en
                un minuto cuesta un minuto.
              </dd>
            </div>

            <div className="reveal">
              <dt className="text-[17px] font-medium text-ink">En segundos, sin redondear</dt>
              <dd className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-muted">
                Doce conversaciones de noventa segundos son dieciocho minutos, no veinticuatro. No
                se cobra la sesión completa por haberla empezado.
              </dd>
            </div>

            <div className="reveal">
              <dt className="text-[17px] font-medium text-ink">
                El contador vuelve a cero el día 1
              </dt>
              <dd className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-muted">
                Mes calendario, por persona. Los minutos que no usaste no se acumulan para el mes
                siguiente.
              </dd>
            </div>

            <div className="reveal">
              <dt className="text-[17px] font-medium text-ink">
                La cifra se verifica contra el proveedor
              </dt>
              <dd className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-muted">
                Lo que mide tu navegador sirve para mostrarte el saldo al instante. Lo que se factura
                es lo que registró ElevenLabs, que es quien cronometra la llamada.
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------------------- Try it */}
      <section className="mx-auto max-w-[75rem] px-6 py-20 lg:py-24">
        <div className="reveal rounded-xl bg-accent-hover px-8 py-14 sm:px-14 sm:py-16">
          <h2 className="max-w-[22ch] font-serif text-[clamp(1.875rem,4vw,2.75rem)] font-normal leading-[1.06] tracking-[-0.02em] text-bg">
            Pruebe el coach antes de pedir el suyo
          </h2>
          <p className="mt-5 max-w-[54ch] text-[17px] leading-relaxed text-bg/75">
            El coach público responde con nuestra base de conocimiento. Hablar con él es la forma
            más rápida de entender qué haría uno entrenado con el material de su organización.
          </p>
          <Link
            href="/coach"
            className="mt-9 inline-flex items-center gap-2.5 rounded-full bg-bg px-6 py-3 text-[16px] font-medium text-ink transition duration-200 ease-out hover:-translate-y-0.5"
          >
            Hablar con el coach
            <span
              aria-hidden
              className="h-[7px] w-[7px] rounded-full bg-gold [animation:ring_2.2s_ease-out_infinite]"
            />
          </Link>
        </div>
      </section>
    </>
  );
}
