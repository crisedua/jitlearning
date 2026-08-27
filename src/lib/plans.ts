import { CLASS_CAP_MINUTES } from './class-length';
import { WEEKLY_MAX, WEEKLY_MIN, WEEKS_PER_MONTH } from './curriculum';
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
  /**
   * Monthly price in whole CLP, for Mercado Pago. Null = not sold through it.
   *
   * A second price rather than a conversion of `priceMinor`. A rate applied at
   * render time makes the number move between the page somebody read and the
   * charge they authorised, and "9 dólares" at today's rate is a number nobody
   * chose: 8.990 is a price, 8.743 is an exchange rate.
   */
  mpPriceMinor: number | null;
  /** False for plans that are sold rather than bought — no self-serve checkout. */
  isPublic: boolean;
  /**
   * The Stripe price this plan charges against, or null when it has not been
   * created yet. Null is what makes the pricing page fall back to writing to a
   * person instead of opening a checkout that cannot complete.
   *
   * **This and `priceMinor` are two records of the same fact and nothing keeps
   * them in step.** The pages quote `priceMinor`; a card is charged whatever
   * Stripe holds against this id. Changing a price means changing both, and the
   * failure if you do not is silent and one-directional: the page advertises one
   * number and the customer is charged another.
   */
  stripePriceId: string | null;
  sortOrder: number;
  blurb: string | null;
}

/** The columns the pricing page needs, as named in Postgres. */
export const PLAN_COLUMNS =
  'id, name, period, monthly_minutes, monthly_sessions, price_minor, currency, overage_minor_per_min, seat_minimum, setup_minor, is_public, sort_order, blurb, stripe_price_id, mp_price_minor';

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
  mp_price_minor: number | null;
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
    /*
     * Null until somebody sets a peso price by hand, which is deliberate: it is
     * what stops the page offering a Mercado Pago button for a plan whose
     * checkout would refuse the sale.
     */
    mpPriceMinor: row.mp_price_minor ?? null,
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
    monthlyMinutes: 10,
    monthlySessions: null,
    priceMinor: 0,
    currency: 'USD',
    overageMinorPerMin: null,
    seatMinimum: null,
    setupMinor: null,
    isPublic: true,
    sortOrder: 10,
    // No names a figure any more: it said "20 minutos" and the allowance is 10.
    // A blurb is a free-text column, so nothing can derive it — the fix is to stop
    // putting a number in the one string that cannot follow one.
    blurb: 'Una clase para resolver una tarea de tu semana y medir lo que ahorra.',
    stripePriceId: null,
    mpPriceMinor: null,
  },
  {
    id: 'founder',
    name: 'Fundador',
    period: 'month',
    monthlyMinutes: 30,
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
    mpPriceMinor: null,
  },
  {
    id: 'standard',
    name: 'Estándar',
    period: 'month',
    monthlyMinutes: 60,
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
    mpPriceMinor: null,
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
  /*
   * The weekly-task claim, sized to the allowance instead of asserted.
   *
   * This was the fixed sentence "Las 3 a 5 tareas de tu semana, una por una" on
   * every paid card, which was true of a 300 minute plan and false the moment
   * one of them stopped being 300. Fundador is 60 — six classes a month, one
   * task a week with room over — and the old bullet would have sold it seven
   * times what it holds, on the card asking for the money.
   *
   * `weeklyTaskPhrase` does the arithmetic the copy used to do in its head.
   * Change an allowance in Postgres and the sentence follows it down.
   */
  const phrase = weeklyTaskPhrase(plan);
  const tasks = phrase.charAt(0).toUpperCase() + phrase.slice(1);

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
 * The cheaper plan that makes this one pointless, if there is one.
 *
 * A plan is dominated when a cheaper public plan in the same currency gives at
 * least as much of everything metered. Estándar was, until
 * 20260826000000_fundador_60_minutos.sql: the same 300 minutes and the same
 * unlimited sessions as Fundador at half the price, and without Fundador's price
 * lock, so there was no axis on which the dearer one won and the page withheld
 * its button. With Fundador at 60 the domination is gone and the card is a real
 * option again — no code changed, which is the point of deriving it.
 *
 * It is a pricing decision, so the numbers are not this function's business. What
 * is its business is the moment of decision: somebody comparing two cards where
 * one is strictly worse does not conclude "I will take the cheap one", they
 * conclude
 * they have misread something and go away to think about it. A confusing choice
 * costs a sale more reliably than a dear one.
 *
 * So the page stops *offering* the dominated tier and shows it as the price
 * without the founder discount. Derived rather than hardcoded, deliberately:
 * lower Fundador's allowance (`supabase/optional/founder_allowance_120.sql`) or
 * raise Estándar's and the domination disappears, and the card becomes a real
 * option again with no code change. The code defers to the pricing decision
 * instead of pre-empting it.
 *
 * null limits mean unlimited, which beats every number. Same rule as the doctor,
 * because two definitions of "dominated" would eventually disagree.
 */
export function dominatedBy(plan: Plan, all: readonly Plan[]): Plan | null {
  if (plan.priceMinor <= 0 || !plan.isPublic) return null;
  const limit = (value: number | null) => (value === null ? Infinity : value);
  const cheaper = all.filter(
    (c) =>
      c.id !== plan.id &&
      c.isPublic &&
      c.priceMinor > 0 &&
      c.currency === plan.currency &&
      c.priceMinor < plan.priceMinor &&
      limit(c.monthlyMinutes) >= limit(plan.monthlyMinutes) &&
      limit(c.monthlySessions) >= limit(plan.monthlySessions),
  );
  // The cheapest of them, so the copy names the best alternative and not merely
  // a better one.
  return cheaper.sort((a, b) => a.priceMinor - b.priceMinor)[0] ?? null;
}


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
/**
 * What a plan costs, in the currency this deployment actually charges in.
 *
 * The page used to render `priceMinor` in `currency` everywhere, which was right
 * while Stripe in dollars was the only rail. With Mercado Pago live, a Chilean
 * visitor was shown "US$9/mes" as the headline and "$9.900" on the button of the
 * same card and had to take on faith that those were the same thing — while the
 * card beside it quoted US$19 with no peso figure at all, so there was nothing
 * to compare the number they would actually be charged against.
 *
 * So the displayed price follows the charge. When the local rail is the one that
 * will take the money, the peso figure is the price and the dollar one is not
 * shown; otherwise nothing changes.
 *
 * Deliberately not a conversion: it returns the price somebody decided, or the
 * other price somebody decided. `mp_price_minor` is null until a human writes it
 * — see 20260823000000_mercadopago.sql on why an exchange rate must never stand
 * in for a price — and a plan without one keeps showing dollars rather than a
 * number nobody chose.
 */
export function displayPrice(
  plan: Pick<Plan, 'priceMinor' | 'currency' | 'mpPriceMinor'>,
  local: boolean,
): { minor: number; currency: string } {
  return local && plan.mpPriceMinor !== null
    ? { minor: plan.mpPriceMinor, currency: 'CLP' }
    : { minor: plan.priceMinor, currency: plan.currency };
}

/** `displayPrice`, already formatted. The common case at every call site. */
export function formatPlanPrice(
  plan: Pick<Plan, 'priceMinor' | 'currency' | 'mpPriceMinor'>,
  local: boolean,
): string {
  const { minor, currency } = displayPrice(plan, local);
  return formatMoney(minor, currency);
}

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
 * The length of a class, which is now a fact rather than an estimate: the
 * platform ends one at `CLASS_CAP_MINUTES`, so nothing longer exists. It was 8
 * when a session was one question answered, then 15, which was what the landing
 * page told people while the agent was cutting them off at 10.
 *
 * Derived rather than restated, because two figures for one thing is how the
 * site came to advertise a class the product could not deliver. The assumption
 * baked in is that a class uses its whole length, which is the conservative
 * direction: a class that finishes early only means more classes than the
 * pricing page promised, never fewer.
 *
 * Still an estimate in the copy that quotes it, which says "unas" and never a
 * precise figure, because how many classes an allowance really holds depends on
 * how many end early.
 *
 * The landing page and the empty notebook said "15 minutos" as prose, which is
 * the same drift one step removed: this number moving would have left two pages
 * quoting the old one while the class count moved. Both read it from here now,
 * so there is one place to change and no sentence that can disagree with it.
 */
export const ASSUMED_SESSION_MINUTES = CLASS_CAP_MINUTES;

/**
 * The weekly cadence this plan can actually keep, as a phrase.
 *
 * One definition, used by the bullet on the pricing card and by the sentence on
 * /progreso that asks for the money. Those two said the same thing in two
 * hardcoded strings, which is how a plan could advertise "las 3 a 5 tareas de tu
 * semana" in both places while holding six classes a month.
 *
 * Lowercase, because it is written to sit mid-sentence; the card capitalises it.
 */
export function weeklyTaskPhrase(plan: Plan): string {
  const classes = approximateSessions(plan.monthlyMinutes);
  if (classes === null) return `las ${WEEKLY_MIN} a ${WEEKLY_MAX} tareas de tu semana, una por una`;

  const perWeek = Math.floor(classes / WEEKS_PER_MONTH);
  if (perWeek >= WEEKLY_MAX) return `las ${WEEKLY_MIN} a ${WEEKLY_MAX} tareas de tu semana, una por una`;
  if (perWeek >= 2) return `hasta ${perWeek} tareas de tu semana, cada semana`;
  if (perWeek === 1) return 'una tarea de tu semana, cada semana';

  /*
   * Fewer than one class a week, so the sentence stops being weekly.
   *
   * "una tarea de tu semana, cada semana" out of an allowance holding three
   * classes a month is the same lie the fixed "3 a 5" was, one order of
   * magnitude down: it promises 4.3 and delivers 3. A plan below the weekly
   * cadence has to be sold by the month, which is the only unit it can keep.
   */
  return classes === 1 ? 'una tarea al mes' : `${classes} tareas al mes, una por clase`;
}

export function approximateSessions(minutes: number | null): number | null {
  if (minutes === null) return null;
  return Math.floor(minutes / ASSUMED_SESSION_MINUTES);
}
