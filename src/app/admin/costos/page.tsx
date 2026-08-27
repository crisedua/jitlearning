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
import { breakEven, DEFAULT_INPUTS, tierAdvice, usd } from '@/lib/costs';
import { getSubscription, minutesThisMonth } from '@/lib/elevenlabs';
import { FALLBACK_PLANS } from '@/lib/plans';
import { checkAdmin } from '@/lib/admin';
import { signInPath } from '@/lib/paths';
import { NotAdmin } from '@/components/NotAdmin';
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
   * page's contents are not disclosed either way. Shared with the other
   * operator pages so all five say the same thing and name the same variable.
   */
  if (!gate.ok) {
    return <NotAdmin email={gate.email} path="/admin/costos" />;
  }

  /*
   * The subscription against what is actually spoken, which nothing asked until
   * it had cost about $920 a year.
   *
   * The account sat on Pro — $99 a month for 1,238 included minutes — against a
   * busiest month of 226. Nothing was broken and no check went red, correctly:
   * an over-provisioned plan works perfectly and shows up only on the invoice,
   * which no page here reads.
   *
   * Minutes come from `minutesThisMonth`, the same source `npm run doctor`
   * uses, rather than from `live.minutes` below. The two count different things
   * — `coach_sessions` only sees what this app minted a URL for — and a page
   * and a script disagreeing about the number under a money decision is the
   * failure this repo keeps paying for.
   *
   * Best-effort: a cost page must still render when ElevenLabs is unreachable.
   */
  const subscription = await (async () => {
    try {
      const [{ minutes, complete }, { tier }] = await Promise.all([
        minutesThisMonth(),
        getSubscription(),
      ]);
      return {
        minutes,
        complete,
        advice: tierAdvice(tier, minutes, DEFAULT_INPUTS.elevenLabsOveragePerMinute),
        raw: tier,
      };
    } catch {
      return null;
    }
  })();

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

      {subscription && (
        <div
          className={`mt-8 max-w-[62ch] rounded-lg border px-4 py-3.5 text-[14px] leading-relaxed ${
            subscription.advice.nonCommercial || subscription.advice.worthMoving
              ? 'border-warning/35 bg-warning-soft/50 text-ink/85'
              : 'border-line bg-surface text-muted'
          }`}
        >
          <p className="font-medium text-ink">
            {subscription.minutes} min hablados este mes · plan{' '}
            {subscription.advice.current?.name ?? subscription.raw}
            {!subscription.complete && ' (piso, no la cifra exacta)'}
          </p>

          {subscription.advice.nonCommercial ? (
            <p className="mt-1.5">
              Ese plan no permite uso comercial y acá se cobra. Es un problema de licencia, no de
              precio: ningún ahorro lo vuelve el plan correcto.
            </p>
          ) : subscription.advice.worthMoving ? (
            <>
              <p className="mt-1.5">
                Cuesta {usd(subscription.advice.currentTotal ?? 0)} este mes.{' '}
                {subscription.advice.best.name} costaría {usd(subscription.advice.bestTotal)}:{' '}
                <span className="font-medium text-ink">
                  {usd(subscription.advice.saving)} al mes
                </span>
                , unos {usd(subscription.advice.saving * 12)} al año.
              </p>
              <p className="mt-1.5">
                Lo que se entrega a cambio es concurrencia:{' '}
                {subscription.advice.current?.concurrency} conversaciones simultáneas bajan a{' '}
                {subscription.advice.best.concurrency}. Pasado ese techo el minuto se cobra al
                doble. Cambiar el plan se hace en el panel de ElevenLabs; no hay API para eso.
              </p>
            </>
          ) : (
            <p className="mt-1.5">
              Es el tamaño correcto para este mes. El siguiente más barato ahorraría{' '}
              {usd(subscription.advice.saving)}.
            </p>
          )}

          {/*
            Dicho siempre, porque es el hecho que hace que este consejo solo
            apunte hacia abajo y es fácil de entender al revés.
          */}
          <p className="mt-2 text-[13px] text-soft">
            La escalera de Agents no tiene descuento por volumen: cada plan vale exactamente sus
            minutos incluidos al precio de excedente. Un plan más grande compra concurrencia, no una
            tarifa mejor, así que subir para ahorrar nunca es correcto.
          </p>
        </div>
      )}

      <div className="mt-12">
        <CostProjector live={live} />
      </div>

      <BreakEven />

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

/**
 * Where each plan stops making money.
 *
 * On this page rather than only in `docs/pricing.md` because it is the number the
 * next pricing decision turns on, and a number in a markdown file is a number
 * nobody re-reads. The cost model priced minutes and the plans sold allowances,
 * and until now nothing compared the two.
 *
 * Read as a warning when the utilisation figure is under 100%: that is a plan
 * whose subscribers lose money if they use what they were sold. That is ordinary
 * for a subscription and dangerous for this one specifically, because every
 * improvement to the product moves average use toward the allowance.
 */
function BreakEven() {
  /*
   * The fallback plan figures, not a database read.
   *
   * This is an operator's planning tool, and the fallback rows are the ones the
   * repository states as the intended prices. Reading `plans` here would make the
   * warning disappear the moment somebody edited a row, which is exactly when it
   * most needs to be visible.
   */
  const rows = breakEven(DEFAULT_INPUTS, [...FALLBACK_PLANS]);
  if (rows.length === 0) return null;

  const underwater = rows.filter((r) => r.utilisation !== null && r.utilisation < 1);

  return (
    <section className="mt-12">
      <h2 className="font-serif text-[26px] font-normal leading-snug tracking-[-0.01em]">
        Dónde cada plan deja de ganar
      </h2>
      <p className="mt-3 max-w-[70ch] text-[15px] leading-relaxed text-muted">
        Minutos al mes que cubre cada plan una vez descontada la comisión de la pasarela, contra
        los minutos que promete. Si el porcentaje es menor a 100%, el plan pierde plata con quien
        use lo que le vendiste.
      </p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-line text-left text-[12px] uppercase tracking-[0.08em] text-soft">
              <th className="py-2 pr-4 font-semibold">Plan</th>
              <th className="py-2 pr-4 text-right font-semibold">Precio</th>
              <th className="py-2 pr-4 text-right font-semibold">Neto</th>
              <th className="py-2 pr-4 text-right font-semibold">Cubre</th>
              <th className="py-2 pr-4 text-right font-semibold">Promete</th>
              <th className="py-2 text-right font-semibold">Uso hasta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const bad = r.utilisation !== null && r.utilisation < 1;
              return (
                <tr key={r.planId} className="border-b border-line/60">
                  <td className="py-2.5 pr-4">{r.planName}</td>
                  <td className="py-2.5 pr-4 text-right font-mono">{usd(r.price)}</td>
                  <td className="py-2.5 pr-4 text-right font-mono text-muted">{usd(r.net)}</td>
                  <td className="py-2.5 pr-4 text-right font-mono">{Math.round(r.minutes)} min</td>
                  <td className="py-2.5 pr-4 text-right font-mono text-muted">
                    {r.allowance ?? 'sin límite'}
                  </td>
                  <td
                    className={`py-2.5 text-right font-mono ${bad ? 'text-warning' : 'text-success'}`}
                  >
                    {r.utilisation === null ? '—' : `${Math.round(r.utilisation * 100)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {underwater.length > 0 && (
        <p className="mt-5 max-w-[70ch] rounded-lg border border-warning/35 bg-warning-soft/50 px-4 py-3 text-[14px] leading-relaxed text-ink/80">
          {underwater.map((r) => r.planName).join(' y ')}{' '}
          {underwater.length === 1 ? 'pierde' : 'pierden'} plata con un suscriptor que use su
          asignación completa. Sobrevive mientras el uso promedio quede muy por debajo, que es lo
          normal en una suscripción, y es justo lo que este producto está diseñado para subir.
          Tres salidas: bajar los minutos incluidos, subir el precio, o dejarlo y vigilar{' '}
          <code className="font-mono text-[12px]">plan_usage</code> el primer mes. La primera está
          escrita y sin aplicar en{' '}
          <code className="font-mono text-[12px]">supabase/optional/founder_allowance_120.sql</code>{' '}
          — sale gratis mientras nadie haya pagado, y cara el día después.
        </p>
      )}
    </section>
  );
}
