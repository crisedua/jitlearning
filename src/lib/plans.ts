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
  /** False for plans that are sold rather than bought — no self-serve checkout. */
  isPublic: boolean;
  sortOrder: number;
  blurb: string | null;
}

/** The columns the pricing page needs, as named in Postgres. */
export const PLAN_COLUMNS =
  'id, name, monthly_minutes, monthly_sessions, price_minor, currency, overage_minor_per_min, seat_minimum, is_public, sort_order, blurb';

/** Shape of a `plans` row as it comes back from Supabase. */
interface PlanRow {
  id: string;
  name: string;
  monthly_minutes: number | null;
  monthly_sessions: number | null;
  price_minor: number;
  currency: string;
  overage_minor_per_min: number | null;
  seat_minimum: number | null;
  is_public: boolean;
  sort_order: number;
  blurb: string | null;
}

export function rowToPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    name: row.name,
    monthlyMinutes: row.monthly_minutes,
    monthlySessions: row.monthly_sessions,
    priceMinor: row.price_minor,
    currency: row.currency,
    overageMinorPerMin: row.overage_minor_per_min,
    seatMinimum: row.seat_minimum,
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
    monthlyMinutes: 20,
    monthlySessions: 3,
    priceMinor: 0,
    currency: 'USD',
    overageMinorPerMin: null,
    seatMinimum: null,
    isPublic: true,
    sortOrder: 10,
    blurb: 'Para probar si el coach sabe de lo tuyo.',
  },
  {
    id: 'esencial',
    name: 'Esencial',
    monthlyMinutes: 60,
    monthlySessions: null,
    priceMinor: 1900,
    currency: 'USD',
    overageMinorPerMin: 35,
    seatMinimum: null,
    isPublic: true,
    sortOrder: 20,
    blurb: 'Una consulta por semana, con margen.',
  },
  {
    id: 'profesional',
    name: 'Profesional',
    monthlyMinutes: 180,
    monthlySessions: null,
    priceMinor: 4900,
    currency: 'USD',
    overageMinorPerMin: 35,
    seatMinimum: null,
    isPublic: true,
    sortOrder: 30,
    blurb: 'Para quien vuelve varias veces por semana.',
  },
  {
    id: 'intensivo',
    name: 'Intensivo',
    monthlyMinutes: 400,
    monthlySessions: null,
    priceMinor: 9900,
    currency: 'USD',
    overageMinorPerMin: 30,
    seatMinimum: null,
    isPublic: true,
    sortOrder: 40,
    blurb: 'Uso diario, o un proyecto con fecha.',
  },
  {
    id: 'equipo',
    name: 'Equipo',
    monthlyMinutes: 120,
    monthlySessions: null,
    priceMinor: 3500,
    currency: 'USD',
    overageMinorPerMin: 30,
    seatMinimum: 10,
    isPublic: false,
    sortOrder: 50,
    blurb: 'Por persona, desde 10 personas.',
  },
] as const;

/**
 * The card bullets, by plan id. A plan with no entry renders without a list
 * rather than breaking, so adding a tier in SQL never takes the page down.
 */
export const PLAN_FEATURES: Record<string, readonly string[]> = {
  free: [
    'Acceso completo a la base de conocimiento',
    'Máximo 3 conversaciones al mes',
    'Se detiene al llegar al límite: nunca genera un cobro',
    'Sin tarjeta',
  ],
  esencial: [
    'Sin límite en el número de conversaciones',
    'Memoria entre sesiones: retoma donde quedaste',
    'Historial de tus consultas',
  ],
  profesional: [
    'Todo lo de Esencial',
    'Tres veces los minutos, no tres veces el precio',
    'Para quien lo usa como parte del trabajo',
  ],
  intensivo: [
    'Todo lo de Profesional',
    'Para uso diario, o un proyecto con fecha',
    'El minuto extra más barato de los planes individuales',
  ],
  // No seat minimum here: the card's prose already states it, from
  // `seatMinimum`, so repeating it as a bullet says the same thing twice and
  // goes stale the day that column changes.
  equipo: [
    'Minutos por persona, no un bolsón compartido',
    'Cada quien conserva su propio historial',
    'Un solo interlocutor para toda la organización',
  ],
};

/** The plan given prominence on the page. */
export const RECOMMENDED_PLAN_ID = 'profesional';

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
 * Roughly how many conversations the allowance buys, for readers who think in
 * sessions rather than minutes. Eight minutes is the assumed length of a
 * question-and-answer session; it is an estimate, not a measurement, so the
 * copy that uses it says "unas" and never a precise figure.
 */
export const ASSUMED_SESSION_MINUTES = 8;

export function approximateSessions(minutes: number | null): number | null {
  if (minutes === null) return null;
  return Math.floor(minutes / ASSUMED_SESSION_MINUTES);
}
