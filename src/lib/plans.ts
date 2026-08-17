/**
 * The plans, for display.
 *
 * The billing source of truth is the `plans` table in Postgres — see
 * `supabase/migrations/20260803000000_pricing_tiers.sql`, and `docs/pricing.md`
 * for the arithmetic the prices come from. The pricing page reads that table at
 * request time, so a price change is a row update and not a deploy.
 *
 * What lives here is the half the database has no column for: the bullet points
 * on a card, and the order to fall back to. Plus a copy of the numbers, used
 * only when the database cannot be reached — a marketing page that 500s because
 * Postgres is asleep is worse than one showing last week's price.
 *
 * That fallback is a real hazard and worth naming: if a price is changed in SQL
 * and not here, a visitor who arrives during an outage sees the old number. Keep
 * the two in step, or delete the fallback and accept the outage.
 *
 * Every bullet below is either a limit the schema actually enforces or a
 * statement about who the plan is for. There is deliberately no invented
 * differentiation — no "priority support", no "advanced analytics". The tiers
 * genuinely differ by minutes and overage rate and nothing else, and a buyer who
 * checks will find that out faster than the copy would survive.
 */

export interface Plan {
  id: string;
  name: string;
  /**
   * Whether the allowance resets. `total` is a lifetime allowance and belongs to
   * the free tier: 20 minutes to see the diagnostic and your plan, and no
   * rollover because there is nothing to roll over. Rendering it as "al mes"
   * promises 240 free minutes a year, which the gate does not grant.
   */
  period: 'month' | 'total';
  /** null = unlimited. */
  monthlyMinutes: number | null;
  monthlySessions: number | null;
  /** In the currency's smallest unit: cents for USD, whole pesos for CLP. */
  priceMinor: number;
  currency: string;
  /** null = the plan stops at its allowance rather than billing past it. */
  overageMinorPerMin: number | null;
  /** Set only on per-seat plans. */
  seatMinimum: number | null;
  /** One-time implementation fee, in the currency's smallest unit. null = none. */
  setupMinor: number | null;
  /** False for plans that are sold rather than bought — no self-serve checkout. */
  isPublic: boolean;
  sortOrder: number;
  blurb: string | null;
}

/** The columns the pricing page needs, as named in Postgres. */
export const PLAN_COLUMNS =
  'id, name, period, monthly_minutes, monthly_sessions, price_minor, currency, overage_minor_per_min, seat_minimum, setup_minor, is_public, sort_order, blurb';

/** Shape of a `plans` row as it comes back from Supabase. */
interface PlanRow {
  id: string;
  name: string;
  period: string | null;
  monthly_minutes: number | null;
  monthly_sessions: number | null;
  price_minor: number;
  currency: string;
  overage_minor_per_min: number | null;
  seat_minimum: number | null;
  setup_minor: number | null;
  is_public: boolean;
  sort_order: number;
  blurb: string | null;
}

export function rowToPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    name: row.name,
    // Defaults to monthly: a row written before the `period` column existed is a
    // monthly plan, and reading a missing value as "lifetime" would silently cap
    // a paying learner at one month's minutes forever.
    period: row.period === 'total' ? 'total' : 'month',
    monthlyMinutes: row.monthly_minutes,
    monthlySessions: row.monthly_sessions,
    priceMinor: row.price_minor,
    currency: row.currency,
    overageMinorPerMin: row.overage_minor_per_min,
    seatMinimum: row.seat_minimum,
    setupMinor: row.setup_minor,
    isPublic: row.is_public,
    sortOrder: row.sort_order,
    blurb: row.blurb,
  };
}

/**
 * Mirrors the migration. Only rendered when the database is unreachable or
 * unconfigured — a fresh clone with no `.env.local` still gets a working page.
 */
export const FALLBACK_PLANS: readonly Plan[] = [
  {
    id: 'free',
    name: 'Gratis',
    period: 'total',
    monthlyMinutes: 20,
    monthlySessions: null,
    priceMinor: 0,
    currency: 'USD',
    overageMinorPerMin: null,
    seatMinimum: null,
    setupMinor: null,
    isPublic: true,
    sortOrder: 10,
    blurb: '20 minutos para resolver una tarea de tu semana y medir lo que ahorra.',
  },
  {
    id: 'founder',
    name: 'Fundador',
    period: 'month',
    monthlyMinutes: 300,
    monthlySessions: null,
    priceMinor: 900,
    currency: 'USD',
    overageMinorPerMin: null,
    seatMinimum: null,
    setupMinor: null,
    isPublic: true,
    sortOrder: 20,
    blurb: 'Precio fijo para siempre. Para los primeros que se suben.',
  },
  {
    id: 'standard',
    name: 'Estándar',
    period: 'month',
    monthlyMinutes: 300,
    monthlySessions: null,
    priceMinor: 1900,
    currency: 'USD',
    overageMinorPerMin: null,
    seatMinimum: null,
    setupMinor: null,
    isPublic: true,
    sortOrder: 30,
    blurb: 'Una clase por semana, con memoria entre sesiones.',
  },
] as const;

/**
 * The card bullets, by plan id. A plan with no entry renders without a list
 * rather than breaking, so adding a tier in SQL never takes the page down.
 */
export const PLAN_FEATURES: Record<string, readonly string[]> = {
  free: [
    'Una tarea real de tu semana, resuelta en la sesión',
    'Los 2 números: lo que tardabas y lo que tardas ahora',
    '20 minutos en total, no al mes',
    'Se detiene al llegar al límite: nunca genera un cobro',
    'Sin tarjeta. Para estudiantes y para probar',
  ],
  founder: [
    '300 minutos al mes',
    'Las 3 a 5 tareas de tu semana, una por una',
    'El currículum completo, hasta el portafolio',
    'El precio no sube mientras mantengas el plan',
  ],
  standard: [
    '300 minutos al mes',
    'Las 3 a 5 tareas de tu semana, una por una',
    'El currículum completo y las horas que recuperas, sumadas',
  ],
};

/**
 * TODO(checkout): nothing here takes money yet.
 *
 * `priceMinor` is the source of truth for what to charge, and the Stripe (or
 * Mercado Pago) price id belongs in a column beside it rather than in code.
 * The button on /planes writes to a person until this exists; wiring a
 * checkout means replacing that handler and setting `profiles.plan_id` from
 * the provider webhook, never from the browser.
 */
export const CHECKOUT_READY = false;

/** The plan given prominence on the page. */
export const RECOMMENDED_PLAN_ID = 'founder';

/**
 * How many minor units make one unit of the currency. CLP has no cents, so a
 * price stored as 19000 is nineteen thousand pesos and not one hundred and
 * ninety.
 */
function minorPerUnit(currency: string): number {
  return currency === 'CLP' ? 1 : 100;
}

/** The symbol to put in front. `$` alone means pesos to a Chilean reader. */
function symbol(currency: string): string {
  return currency === 'CLP' ? '$' : 'US$';
}

/**
 * A price, formatted for a Chilean reader: dot for thousands, comma for
 * decimals. Whole amounts drop the decimals — `US$19`, not `US$19,00` — while
 * anything with a fraction keeps them, so a per-minute rate still reads as
 * `US$0,35`.
 */
export function formatMoney(minor: number, currency: string): string {
  const value = minor / minorPerUnit(currency);
  const whole = Number.isInteger(value);
  return (
    symbol(currency) +
    value.toLocaleString('es-CL', {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    })
  );
}

/** `60 min` / `Sin límite`. */
export function formatMinutes(minutes: number | null): string {
  return minutes === null ? 'Sin límite' : `${minutes.toLocaleString('es-CL')} min`;
}

/** What a minute past the allowance costs, in words. */
export function formatOverage(plan: Plan): string {
  if (plan.overageMinorPerMin === null) {
    return 'Sin excedentes: se detiene al llegar al límite.';
  }
  return `Minuto adicional: ${formatMoney(plan.overageMinorPerMin, plan.currency)}`;
}

/**
 * Roughly how many classes the allowance buys, for readers who think in sessions
 * rather than minutes.
 *
 * 15 minutes, which is what the landing page tells people a class takes. It was
 * 8 when a session was one question answered, and leaving it there had the
 * pricing page promising 37 classes out of an allowance that holds 20. An
 * estimate, not a measurement, so the copy that uses it says "unas" and never a
 * precise figure.
 */
export const ASSUMED_SESSION_MINUTES = 15;

export function approximateSessions(minutes: number | null): number | null {
  if (minutes === null) return null;
  return Math.floor(minutes / ASSUMED_SESSION_MINUTES);
}
