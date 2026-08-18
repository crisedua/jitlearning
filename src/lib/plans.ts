import { WEEKLY_MAX, WEEKLY_MIN } from './curriculum';
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
  /**
   * The Stripe price this plan charges against, or null when it has not been
   * created yet. Null is what makes the pricing page fall back to writing to a
   * person instead of opening a checkout that cannot complete.
   */
  stripePriceId: string | null;
  sortOrder: number;
  blurb: string | null;
}

/** The columns the pricing page needs, as named in Postgres. */
export const PLAN_COLUMNS =
  'id, name, period, monthly_minutes, monthly_sessions, price_minor, currency, overage_minor_per_min, seat_minimum, setup_minor, is_public, sort_order, blurb, stripe_price_id';

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
  stripe_price_id: string | null;
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
    stripePriceId: row.stripe_price_id ?? null,
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
    stripePriceId: null,
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
    // Deliberately null in the fallback: these rows are only rendered when
    // Postgres is unreachable, and offering a checkout with a hardcoded price id
    // during an outage is how somebody gets charged for the wrong thing.
    stripePriceId: null,
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
    stripePriceId: null,
  },
] as const;

/**
 * The free tier, as compiled.
 *
 * Copy that quotes the free allowance appears on the landing page, the pricing
 * page and its metadata, none of which can read Postgres at build time. Reading
 * it from the same array the fallback prices come from is the closest thing to
 * one source those places can have — and far better than three literals that
 * were already wrong once, when the tier's window was described as monthly.
 */
export const FREE_PLAN = FALLBACK_PLANS.find((p) => p.period === 'total') ?? FALLBACK_PLANS[0]!;

/** Public paid tiers, for copy that counts them. */
export const PAID_PLANS = FALLBACK_PLANS.filter((p) => p.isPublic && p.priceMinor > 0);


/**
 * The card bullets, by plan id. A plan with no entry renders without a list
 * rather than breaking, so adding a tier in SQL never takes the page down.
 */
/**
 * The bullets under each price, with every number derived.
 *
 * These were literals: "300 minutos al mes", "20 minutos en total", "las 3 a 5
 * tareas". The card above them already renders the allowance from
 * `plans.monthly_minutes`, so the same figure appeared twice on one card, once
 * from the database and once from a string — on a page whose entire premise is
 * that "changing a price is a row update instead of a deploy, so the number a
 * visitor is quoted is the number the limits are enforced against".
 *
 * Change an allowance in Postgres and the headline would have moved while the
 * bullet stayed, quoting two different numbers a centimetre apart. The weekly
 * range had the same problem against `WEEKLY_MIN` and `WEEKLY_MAX`, which is
 * what actually decides how many tasks a plan is built for.
 *
 * A function of the plan, so the drift is not possible rather than merely
 * unlikely.
 */
export function planFeatures(plan: Plan): readonly string[] {
  const allowance =
    plan.period === 'total'
      ? `${formatMinutes(plan.monthlyMinutes)} en total, no al mes`
      : `${formatMinutes(plan.monthlyMinutes)} al mes`;
  const tasks = `Las ${WEEKLY_MIN} a ${WEEKLY_MAX} tareas de tu semana, una por una`;

  switch (plan.id) {
    case 'free':
      return [
        'Una tarea real de tu semana, resuelta en la sesión',
        'Los 2 números: lo que tardabas y lo que tardas ahora',
        allowance,
        'Se detiene al llegar al límite: nunca genera un cobro',
        'Sin tarjeta. Para estudiantes y para probar',
      ];
    case 'founder':
      return [
        allowance,
        tasks,
        'El currículum completo, hasta el portafolio',
        'El precio no sube mientras mantengas el plan',
      ];
    case 'standard':
      return [
        allowance,
        tasks,
        'El currículum completo y las horas que recuperas, sumadas',
      ];
    default:
      return [];
  }
}

/**
 * Checkout exists now: `plans.stripe_price_id` names the Stripe price, the button
 * on /planes opens a Checkout Session, and `profiles.plan_id` is written by the
 * Stripe webhook and by nothing else. See `src/lib/billing.ts`.
 *
 * `priceMinor` remains the number shown on the page, and Stripe's price is the
 * number actually charged. **They are two records of the same fact and nothing
 * keeps them in step**, so changing a price means changing it in both places. The
 * pricing page reads this one; a card reads the other.
 */
export const CHECKOUT_READY = true;

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

/**
 * Minutes as somebody says them out loud: "1 hora y 5 minutos".
 *
 * Used for the recovered-hours figure, which the progress page calls the only
 * claim this product makes about its own value and prints directly above the
 * price. It pluralised `hora` and never `minuto`, so a saving of sixty-one
 * minutes read "1 hora y 1 minutos" and a saving of one read "1 minutos".
 *
 * Both are reachable: any total ending in one, on the sentence carrying the
 * whole argument. A number that is arithmetically right and grammatically wrong
 * costs more here than anywhere else on the site, because the argument is that
 * these figures are careful.
 */
export function spellMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const m = `${minutes} minuto${minutes === 1 ? '' : 's'}`;
  if (hours === 0) return m;
  const h = `${hours} hora${hours === 1 ? '' : 's'}`;
  return minutes === 0 ? h : `${h} y ${m}`;
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
