'use client';

/**
 * The cost model, made editable.
 *
 * Every number the projection rests on is an input rather than a constant,
 * because every one of them is an estimate until there is a month of real
 * traffic behind it. A dashboard that hides its assumptions cannot be corrected
 * by the person who notices they are wrong.
 *
 * The arithmetic lives in `src/lib/costs.ts` and is deliberately not duplicated
 * here — this file is inputs, tables, and formatting.
 */
import { useMemo, useState } from 'react';
import {
  DEFAULT_INPUTS,
  ELEVENLABS_TIERS,
  SCENARIOS,
  type CostInputs,
  number as fmt,
  project,
  usd,
  usdPrecise,
} from '@/lib/costs';

/** What the database says is actually happening, when it can say anything. */
export interface LiveUsage {
  /** Learners with at least one session this calendar month. */
  activeUsers: number;
  /** Everyone with a profile, whether or not they have talked. */
  totalUsers: number;
  /** Minutes recorded this calendar month, reconciled and not. */
  minutes: number;
  /** The subset that `sync:usage` has confirmed against ElevenLabs. */
  syncedMinutes: number;
  sessions: number;
  /** Null when there is no schema or no service key — the page still works. */
  available: boolean;
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  step = 1,
  min = 0,
  suffix,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  suffix?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-body">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : 0}
          step={step}
          min={min}
          // An empty field is a number the operator is in the middle of typing,
          // not a zero they meant. Treating it as 0 makes the whole table lurch
          // to nonsense between two keystrokes.
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          className="w-full rounded-md border border-field bg-surface px-3 py-2 font-mono text-[15px] text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
        {suffix && <span className="shrink-0 text-[13px] text-soft">{suffix}</span>}
      </span>
      {hint && <span className="text-[12px] leading-snug text-soft">{hint}</span>}
    </label>
  );
}

/** One row of the breakdown table. */
function Row({
  name,
  detail,
  amount,
  total,
  strong,
}: {
  name: string;
  detail: string;
  amount: number;
  total: number;
  strong?: boolean;
}) {
  const share = total > 0 ? (amount / total) * 100 : 0;
  return (
    <tr className="border-t border-line">
      <th scope="row" className={`py-3 pr-4 text-left align-top text-[15px] font-medium ${strong ? 'text-ink' : 'text-body'}`}>
        {name}
      </th>
      <td className="py-3 pr-4 align-top text-[13px] leading-snug text-soft">{detail}</td>
      <td className="py-3 pr-4 text-right align-top font-mono text-[15px] text-ink">{usd(amount)}</td>
      <td className="py-3 text-right align-top font-mono text-[13px] text-soft">
        {fmt(share, 1)}%
      </td>
    </tr>
  );
}

export function CostProjector({ live }: { live: LiveUsage }) {
  const [input, setInput] = useState<CostInputs>(DEFAULT_INPUTS);
  const [showAssumptions, setShowAssumptions] = useState(false);

  const set = <K extends keyof CostInputs>(key: K, value: CostInputs[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }));

  const result = useMemo(() => project(input), [input]);

  /**
   * The same headcount, at three intensities. Recomputed from the current
   * assumptions rather than from the defaults, so changing a token price moves
   * the comparison too.
   */
  const scenarios = useMemo(
    () =>
      SCENARIOS.map((scenario) => ({
        scenario,
        result: project({ ...input, minutesPerUser: scenario.minutesPerUser }),
      })),
    [input],
  );

  /** Seed the inputs from what actually happened this month. */
  const useRealData = () => {
    const users = live.activeUsers || live.totalUsers;
    setInput((prev) => ({
      ...prev,
      users: users || prev.users,
      minutesPerUser: users > 0 ? Math.round((live.minutes / users) * 10) / 10 : prev.minutesPerUser,
    }));
  };

  return (
    <div className="flex flex-col gap-10">
      {/* ------------------------------------------------------ live data --- */}
      <section
        aria-labelledby="reales"
        className="rounded-lg border border-line bg-surface-alt p-6"
      >
        <h2 id="reales" className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">
          Este mes, de verdad
        </h2>

        {live.available ? (
          <>
            <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Personas con cuenta', value: fmt(live.totalUsers) },
                { label: 'Hablaron este mes', value: fmt(live.activeUsers) },
                { label: 'Minutos del mes', value: fmt(live.minutes, 1) },
                { label: 'Conversaciones', value: fmt(live.sessions) },
              ].map((stat) => (
                <div key={stat.label}>
                  <dt className="text-[13px] text-soft">{stat.label}</dt>
                  <dd className="mt-1 font-mono text-[26px] leading-none text-ink">{stat.value}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-5 max-w-[70ch] text-[13px] leading-relaxed text-muted">
              De esos minutos, {fmt(live.syncedMinutes, 1)} están confirmados contra ElevenLabs; el
              resto los reportó el navegador y todavía no pasa por{' '}
              <code className="font-mono text-[12px]">npm run sync:usage</code>. Para decidir sobre
              dinero sirve el primer número.
            </p>

            <button
              type="button"
              onClick={useRealData}
              className="mt-5 inline-flex items-center rounded-full border border-line-strong px-4 py-2 text-[14px] font-medium text-ink transition hover:border-accent hover:text-accent"
            >
              Usar estos datos en la proyección
            </button>
          </>
        ) : (
          <p className="mt-4 max-w-[70ch] text-[15px] leading-relaxed text-muted">
            No hay datos de uso disponibles: falta la clave de servicio de Supabase, o las
            migraciones todavía no corren en este proyecto. La proyección de abajo sigue
            funcionando — es aritmética, no depende de la base.
          </p>
        )}
      </section>

      {/* --------------------------------------------------------- inputs --- */}
      <section aria-labelledby="supuestos">
        <h2 id="supuestos" className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">
          Proyección
        </h2>

        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField
            label="Personas"
            hint="Que efectivamente hablan en el mes."
            value={input.users}
            onChange={(v) => set('users', v)}
          />
          <NumberField
            label="Minutos por persona"
            hint="Al mes."
            value={input.minutesPerUser}
            onChange={(v) => set('minutesPerUser', v)}
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-body">Plan de ElevenLabs</span>
            <select
              value={input.elevenLabsTierId}
              onChange={(e) => set('elevenLabsTierId', e.target.value)}
              className="w-full rounded-md border border-field bg-surface px-3 py-2 text-[15px] text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
            >
              <option value="auto">El más barato que sirva</option>
              {ELEVENLABS_TIERS.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.name} — {usd(tier.monthly, 0)} / {fmt(tier.includedMinutes)} min
                </option>
              ))}
            </select>
            <span className="text-[12px] leading-snug text-soft">
              El excedente cuesta lo mismo en todos, así que un plan chico con excedente suele ganarle
              al siguiente.
            </span>
          </div>
          <div className="flex flex-col justify-end">
            <button
              type="button"
              onClick={() => setShowAssumptions((v) => !v)}
              aria-expanded={showAssumptions}
              className="inline-flex items-center justify-center rounded-full border border-line-strong px-4 py-2 text-[14px] font-medium text-ink transition hover:border-accent hover:text-accent"
            >
              {showAssumptions ? 'Ocultar supuestos' : 'Ver y editar supuestos'}
            </button>
          </div>
        </div>

        {showAssumptions && (
          <div className="mt-6 rounded-lg border border-line bg-surface p-6">
            <p className="max-w-[75ch] text-[14px] leading-relaxed text-muted">
              De aquí sale el costo por minuto. Los valores por defecto vienen de la configuración
              real del agente — un prompt de sistema de 17.791 caracteres y{' '}
              <code className="font-mono text-[12px]">max_documents_length</code> de 12.000 — contra
              el precio de lista de Claude Sonnet 4.5. Los dos primeros son estimaciones, no
              mediciones: un mes de tráfico real los reemplaza.
            </p>

            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <NumberField
                label="Turnos por minuto"
                hint="Estimación. message_count y duration_seconds dan el número real."
                value={input.turnsPerMinute}
                onChange={(v) => set('turnsPerMinute', v)}
                step={0.1}
              />
              <NumberField
                label="Tokens de entrada por turno"
                hint="Prompt + pasajes recuperados + historia."
                value={input.inputTokensPerTurn}
                onChange={(v) => set('inputTokensPerTurn', v)}
                step={100}
              />
              <NumberField
                label="Tokens de salida por turno"
                hint="Una respuesta hablada."
                value={input.outputTokensPerTurn}
                onChange={(v) => set('outputTokensPerTurn', v)}
                step={10}
              />
              <NumberField
                label="Entrada"
                suffix="/ M tokens"
                value={input.inputPricePerMTok}
                onChange={(v) => set('inputPricePerMTok', v)}
                step={0.5}
              />
              <NumberField
                label="Salida"
                suffix="/ M tokens"
                value={input.outputPricePerMTok}
                onChange={(v) => set('outputPricePerMTok', v)}
                step={0.5}
              />
              <NumberField
                label="Excedente de ElevenLabs"
                suffix="/ min"
                hint="Igual en todos los planes."
                value={input.elevenLabsOveragePerMinute}
                onChange={(v) => set('elevenLabsOveragePerMinute', v)}
                step={0.01}
              />
              <NumberField
                label="Supabase"
                suffix="/ mes"
                hint="Pro. El plan gratis pausa el proyecto y no tiene respaldos."
                value={input.supabaseMonthly}
                onChange={(v) => set('supabaseMonthly', v)}
                step={5}
              />
              <NumberField
                label="Vercel (red y alojamiento)"
                suffix="/ mes"
                hint="Pro. Hobby no permite uso comercial. Incluye 1 TB de tráfico."
                value={input.vercelMonthly}
                onChange={(v) => set('vercelMonthly', v)}
                step={5}
              />
              <div className="flex flex-col justify-end">
                <button
                  type="button"
                  onClick={() => setInput(DEFAULT_INPUTS)}
                  className="inline-flex items-center justify-center rounded-full border border-line-strong px-4 py-2 text-[14px] font-medium text-ink transition hover:border-accent hover:text-accent"
                >
                  Volver a los valores por defecto
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------ headlines --- */}
      <section aria-label="Resumen de la proyección">
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Costo total al mes', value: usd(result.total), tone: 'strong' },
            { label: 'Por persona', value: usd(result.costPerUser) },
            { label: 'Por minuto, todo incluido', value: usdPrecise(result.averagePerMinute) },
            { label: 'Un minuto más cuesta', value: usdPrecise(result.marginalPerMinute) },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`rounded-lg border p-5 ${
                stat.tone === 'strong' ? 'border-accent/45 bg-accent-soft' : 'border-line bg-surface'
              }`}
            >
              <dt className="text-[13px] text-muted">{stat.label}</dt>
              <dd className="mt-1.5 font-mono text-[28px] leading-none text-ink">{stat.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 max-w-[75ch] text-[13px] leading-relaxed text-soft">
          «Un minuto más» es el costo marginal una vez agotados los minutos incluidos: excedente de
          ElevenLabs más inferencia. Es el número contra el cual conviene fijar precios; el promedio
          incluye los costos fijos y baja a medida que crece el uso.
        </p>
      </section>

      {/* ------------------------------------------------------ breakdown --- */}
      <section aria-labelledby="desglose">
        <h2 id="desglose" className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">
          Desglose
        </h2>

        <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[42rem] border-collapse px-6 text-left">
            <caption className="sr-only">
              Costo mensual por proveedor para {fmt(input.users)} personas y{' '}
              {fmt(result.totalMinutes)} minutos.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="px-6 pb-3 pt-5 text-[13px] font-semibold text-soft">
                  Concepto
                </th>
                <th scope="col" className="px-0 pb-3 pt-5 text-[13px] font-semibold text-soft">
                  Cómo se calcula
                </th>
                <th scope="col" className="px-0 pb-3 pt-5 text-right text-[13px] font-semibold text-soft">
                  Al mes
                </th>
                <th scope="col" className="px-6 pb-3 pt-5 text-right text-[13px] font-semibold text-soft">
                  Del total
                </th>
              </tr>
            </thead>
            <tbody className="[&_td]:px-0 [&_th[scope=row]]:pl-6 [&_tr>*:last-child]:pr-6">
              <Row
                name="ElevenLabs — voz"
                detail={`${result.elevenLabs.tier.name}${result.elevenLabs.auto ? ' (elegido por precio)' : ''}: ${usd(result.elevenLabs.subscription, 0)} de suscripción${
                  result.elevenLabs.overageMinutes > 0
                    ? ` + ${fmt(result.elevenLabs.overageMinutes)} min de excedente`
                    : `, ${fmt(result.elevenLabs.tier.includedMinutes)} min incluidos`
                }`}
                amount={result.elevenLabs.total}
                total={result.total}
              />
              <Row
                name="Claude — inferencia"
                detail={`${usdPrecise(result.llmPerMinute)}/min × ${fmt(result.totalMinutes)} min. Se factura aparte de los minutos de voz.`}
                amount={result.llm}
                total={result.total}
              />
              <Row
                name="Supabase — base de datos"
                detail="Fijo. Cuentas, planes y el registro de uso."
                amount={result.supabase}
                total={result.total}
              />
              <Row
                name="Vercel — red y alojamiento"
                detail="Fijo. Incluye tráfico hasta 1 TB al mes."
                amount={result.vercel}
                total={result.total}
              />
              <tr className="border-t-2 border-line-strong">
                <th scope="row" className="py-4 pl-6 pr-4 text-left text-[16px] font-semibold text-ink">
                  Total
                </th>
                <td className="py-4 text-[13px] text-soft">
                  {fmt(input.users)} personas · {fmt(result.totalMinutes)} minutos
                </td>
                <td className="py-4 text-right font-mono text-[18px] font-medium text-ink">
                  {usd(result.total)}
                </td>
                <td className="py-4 pr-6 text-right font-mono text-[13px] text-soft">100%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-4 max-w-[75ch] text-[13px] leading-relaxed text-soft">
          El plan {result.elevenLabs.tier.name} permite {fmt(result.concurrency)} conversaciones
          simultáneas. Pasado ese número el minuto se cobra al doble, así que el techo que importa no
          es cuánta gente tiene cuenta sino cuánta habla al mismo tiempo.
        </p>
      </section>

      {/* ------------------------------------------------------ scenarios --- */}
      <section aria-labelledby="escenarios">
        <h2 id="escenarios" className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">
          Escenarios
        </h2>
        <p className="mt-3 max-w-[75ch] text-[15px] leading-relaxed text-muted">
          Las mismas {fmt(input.users)} personas, hablando distinto. La diferencia entre columnas es
          la razón por la que el precio se cobra por minuto y no por asiento.
        </p>

        <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[44rem] border-collapse text-left">
            <thead>
              <tr>
                <th scope="col" className="px-6 pb-3 pt-5 text-[13px] font-semibold text-soft">
                  Escenario
                </th>
                {scenarios.map(({ scenario }) => (
                  <th
                    key={scenario.id}
                    scope="col"
                    className="pb-3 pt-5 pr-6 text-right text-[13px] font-semibold text-soft"
                  >
                    {scenario.name}
                    <span className="block font-normal normal-case text-[12px] text-soft">
                      {fmt(scenario.minutesPerUser)} min · {scenario.note}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                {
                  label: 'Minutos totales',
                  value: (r: ReturnType<typeof project>) => fmt(r.totalMinutes),
                },
                {
                  label: 'ElevenLabs',
                  value: (r: ReturnType<typeof project>) =>
                    `${usd(r.elevenLabs.total)} · ${r.elevenLabs.tier.name}`,
                },
                { label: 'Claude', value: (r: ReturnType<typeof project>) => usd(r.llm) },
                {
                  label: 'Supabase + Vercel',
                  value: (r: ReturnType<typeof project>) => usd(r.supabase + r.vercel),
                },
              ].map((row) => (
                <tr key={row.label} className="border-t border-line">
                  <th scope="row" className="px-6 py-3 text-left text-[15px] font-medium text-body">
                    {row.label}
                  </th>
                  {scenarios.map(({ scenario, result: r }) => (
                    <td
                      key={scenario.id}
                      className="py-3 pr-6 text-right font-mono text-[14px] text-ink"
                    >
                      {row.value(r)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-line-strong">
                <th scope="row" className="px-6 py-4 text-left text-[16px] font-semibold text-ink">
                  Total al mes
                </th>
                {scenarios.map(({ scenario, result: r }) => (
                  <td
                    key={scenario.id}
                    className="py-4 pr-6 text-right font-mono text-[18px] font-medium text-ink"
                  >
                    {usd(r.total)}
                  </td>
                ))}
              </tr>
              <tr className="border-t border-line">
                <th scope="row" className="px-6 py-3 text-left text-[15px] font-medium text-body">
                  Por persona
                </th>
                {scenarios.map(({ scenario, result: r }) => (
                  <td key={scenario.id} className="py-3 pr-6 text-right font-mono text-[14px] text-muted">
                    {usd(r.costPerUser)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
