/**
 * What it costs to run the coach.
 *
 * Pure arithmetic, no React and no I/O, so the same model backs the admin page
 * and can be called from a script. `docs/pricing.md` is the prose version of
 * everything here and explains where each default came from; if a number moves
 * there it must move here too.
 *
 * The shape of the model is the important part: **two of the four line items
 * scale with spoken minutes and two do not.** ElevenLabs bills the voice and
 * the LLM behind it is billed separately at cost, both per minute; Supabase and
 * Vercel are flat until they are not. That is why every projection here is
 * driven by minutes rather than by user count — users are just a way to arrive
 * at a number of minutes.
 *
 * Money is in whole dollars and fractions of them, not minor units. This is an
 * internal model whose inputs are already estimates; a cent of float error is
 * far below the error in "two turns per minute".
 */

// ------------------------------------------------------------- ElevenLabs ---

export interface ElevenLabsTier {
  id: string;
  name: string;
  /** Subscription price per month. */
  monthly: number;
  /** Minutes included in that subscription. */
  includedMinutes: number;
  /** Simultaneous conversations before burst pricing applies. */
  concurrency: number;
  /**
   * Whether the cheapest-tier search may land here.
   *
   * Free is excluded, and the reason is worth stating because the arithmetic
   * disagrees: at 1,800 minutes, Free plus overage prices out about a dollar
   * below Pro, so a pure cost search picks it. It is a trial tier — four
   * concurrent conversations, and a commercial deployment has no business
   * running on it. Leaving it selectable by hand keeps the ladder honest
   * without letting the optimiser recommend something nobody would sign.
   */
  commercial: boolean;
}

/**
 * The published ladder. Overage is the same on every tier, which is what makes
 * the cheapest choice a plain comparison rather than a negotiation: a smaller
 * subscription plus overage often beats the next tier up.
 */
export const ELEVENLABS_TIERS: readonly ElevenLabsTier[] = [
  { id: 'free', name: 'Free', monthly: 0, includedMinutes: 15, concurrency: 4, commercial: false },
  { id: 'starter', name: 'Starter', monthly: 6, includedMinutes: 75, concurrency: 6, commercial: true },
  { id: 'creator', name: 'Creator', monthly: 22, includedMinutes: 275, concurrency: 10, commercial: true },
  { id: 'pro', name: 'Pro', monthly: 99, includedMinutes: 1_238, concurrency: 20, commercial: true },
  { id: 'scale', name: 'Scale', monthly: 299, includedMinutes: 3_738, concurrency: 30, commercial: true },
  { id: 'business', name: 'Business', monthly: 990, includedMinutes: 12_375, concurrency: 40, commercial: true },
] as const;

// ---------------------------------------------------------------- inputs ----

/**
 * Every assumption the model runs on. All of it is editable in the admin page,
 * because all of it is a guess until there is a month of real traffic — and a
 * dashboard that hides its assumptions is a dashboard nobody can correct.
 */
export interface CostInputs {
  /** People with accounts who actually talk in a month. */
  users: number;
  /** Spoken minutes per active user per month. */
  minutesPerUser: number;

  /** Model turns per spoken minute. One question and one answer is roughly one. */
  turnsPerMinute: number;
  /** System prompt + retrieved passages + history, per turn. */
  inputTokensPerTurn: number;
  /** A spoken answer, per turn. */
  outputTokensPerTurn: number;
  /** USD per million input tokens. */
  inputPricePerMTok: number;
  /** USD per million output tokens. */
  outputPricePerMTok: number;

  /** USD per minute past the ElevenLabs subscription's allowance. */
  elevenLabsOveragePerMinute: number;
  /** Force a tier, or let the model pick the cheapest that fits. */
  elevenLabsTierId: string | 'auto';

  /**
   * Lookups per spoken minute. The teacher calls the search tool only when the
   * answer depends on something current, so this is well under 1: roughly two
   * lookups in a 15-minute class.
   */
  lookupsPerMinute: number;
  /** USD per lookup: one Claude Opus 5 turn plus its web searches. */
  lookupCost: number;

  /** Percentage the payment processor takes, as a fraction. */
  processorRate: number;
  /** Flat fee per transaction, in USD. */
  processorFixed: number;

  /** Flat monthly cost of the database. */
  supabaseMonthly: number;
  /** Flat monthly cost of hosting and bandwidth. */
  vercelMonthly: number;
}

/**
 * Defaults derived in `docs/pricing.md` §1, from this repository's own agent
 * configuration: the persona measured by `teacherSystemPrompt()` and
 * `max_documents_length` of 12,000 characters, against Claude Sonnet 4.5 list
 * pricing for the conversation turn.
 *
 * `inputTokensPerTurn` tracks the persona, which is now ~15,400 characters
 * (~4,400 tokens) plus retrieval and history. Re-measure it when the prompt
 * changes: the doctor prints the character count on every run.
 */
export const DEFAULT_INPUTS: CostInputs = {
  users: 30,
  minutesPerUser: 60,

  turnsPerMinute: 2,
  inputTokensPerTurn: 8_400,
  outputTokensPerTurn: 200,
  inputPricePerMTok: 3,
  outputPricePerMTok: 15,

  elevenLabsOveragePerMinute: 0.08,
  elevenLabsTierId: 'auto',

  /*
   * Two lookups in a 15-minute class, each one an Opus 5 turn (~12k input from
   * the search results, ~650 output including thinking) plus up to 4 web
   * searches at $10/1k. That is ~$0.076 + ~$0.04 = ~$0.116, which makes a lookup
   * cost about the same as one spoken minute.
   *
   * Small, but it is the line most likely to be forgotten, because it is billed
   * by a third provider that appears on neither the ElevenLabs nor the Supabase
   * invoice.
   */
  lookupsPerMinute: 2 / 15,
  lookupCost: 0.116,

  // Stripe's standard rate. On a $9 subscription this is $0.56, or 6% of the
  // revenue, which is not negligible against these margins.
  processorRate: 0.029,
  processorFixed: 0.3,

  supabaseMonthly: 25,
  vercelMonthly: 20,
};

// --------------------------------------------------------------- outputs ----

export interface ElevenLabsCost {
  tier: ElevenLabsTier;
  /** Minutes billed above the tier's allowance. */
  overageMinutes: number;
  subscription: number;
  overage: number;
  total: number;
  /** True when the tier was chosen for being cheapest rather than pinned. */
  auto: boolean;
}

export interface CostBreakdown {
  totalMinutes: number;
  /** USD per spoken minute of LLM inference. */
  llmPerMinute: number;
  /** USD per spoken minute of search lookups, amortised over the class. */
  lookupPerMinute: number;

  elevenLabs: ElevenLabsCost;
  llm: number;
  lookups: number;
  supabase: number;
  vercel: number;
  total: number;

  /** The marginal cost of one more minute — the number to price against. */
  marginalPerMinute: number;
  costPerUser: number;
  /** Total divided by minutes, so it carries the fixed costs too. */
  averagePerMinute: number;
  /** Simultaneous conversations the chosen tier allows before burst pricing. */
  concurrency: number;
}

/**
 * The cheapest way to buy a given number of minutes.
 *
 * Checks every tier rather than the smallest one that fits, because overage is
 * priced identically everywhere: at 1,800 minutes, Pro plus 562 overage minutes
 * costs less than a Scale subscription that would cover them outright.
 */
export function elevenLabsCost(
  minutes: number,
  overagePerMinute: number,
  tierId: string | 'auto' = 'auto',
): ElevenLabsCost {
  const price = (tier: ElevenLabsTier) => {
    const overageMinutes = Math.max(0, minutes - tier.includedMinutes);
    const overage = overageMinutes * overagePerMinute;
    return {
      tier,
      overageMinutes,
      subscription: tier.monthly,
      overage,
      total: tier.monthly + overage,
      auto: tierId === 'auto',
    };
  };

  if (tierId !== 'auto') {
    const pinned = ELEVENLABS_TIERS.find((t) => t.id === tierId);
    if (pinned) return { ...price(pinned), auto: false };
  }

  /*
   * Cheapest wins; on a tie, the tier with more concurrency wins.
   *
   * The tie is not hypothetical — at 4,800 minutes Pro-plus-overage and Scale
   * come to exactly the same money, and taking the first match would buy 20
   * simultaneous conversations where 30 were available for the same price.
   * Concurrency is the ceiling that actually bites, since going over it doubles
   * the per-minute rate.
   */
  // A cent. Two tiers that price out this close are the same price, and
  // floating-point noise on a multiplication like 3562 × 0.08 is easily larger
  // than the difference the comparison would otherwise turn on.
  const TIE = 0.01;

  return ELEVENLABS_TIERS.filter((tier) => tier.commercial)
    .map(price)
    .reduce((best, candidate) => {
      if (candidate.total < best.total - TIE) return candidate;
      if (candidate.total > best.total + TIE) return best;
      return candidate.tier.concurrency > best.tier.concurrency ? candidate : best;
    });
}

/**
 * What a minute of inference costs.
 *
 * Billed separately from the voice and deducted from ElevenLabs credits at
 * cost, so it never appears on an ElevenLabs invoice line — which is exactly
 * why it is easy to leave out of a cost model and why it is ~43% of the
 * variable cost here.
 */
export function llmCostPerMinute(input: CostInputs): number {
  const inputCost = (input.inputTokensPerTurn * input.turnsPerMinute * input.inputPricePerMTok) / 1e6;
  const outputCost =
    (input.outputTokensPerTurn * input.turnsPerMinute * input.outputPricePerMTok) / 1e6;
  return inputCost + outputCost;
}

export function project(input: CostInputs): CostBreakdown {
  const totalMinutes = Math.max(0, input.users * input.minutesPerUser);
  const llmPerMinute = llmCostPerMinute(input);
  // The search tool, billed by Anthropic and invisible on every other invoice.
  const lookupPerMinute = input.lookupsPerMinute * input.lookupCost;

  const elevenLabs = elevenLabsCost(
    totalMinutes,
    input.elevenLabsOveragePerMinute,
    input.elevenLabsTierId,
  );
  const llm = llmPerMinute * totalMinutes;
  const lookups = lookupPerMinute * totalMinutes;
  const total =
    elevenLabs.total + llm + lookups + input.supabaseMonthly + input.vercelMonthly;

  return {
    totalMinutes,
    llmPerMinute,
    lookupPerMinute,
    elevenLabs,
    llm,
    lookups,
    supabase: input.supabaseMonthly,
    vercel: input.vercelMonthly,
    total,
    // Once the subscription's included minutes are gone, one more minute costs
    // an overage minute plus its inference. Below that line it is inference
    // only, which is the cheaper and less useful number to plan with.
    marginalPerMinute: input.elevenLabsOveragePerMinute + llmPerMinute + lookupPerMinute,
    costPerUser: input.users > 0 ? total / input.users : 0,
    averagePerMinute: totalMinutes > 0 ? total / totalMinutes : 0,
    concurrency: elevenLabs.tier.concurrency,
  };
}

// ------------------------------------------------------------- break-even ---

export interface BreakEven {
  planId: string;
  planName: string;
  /** USD per month the learner pays. */
  price: number;
  /** What lands after the payment processor takes its cut. */
  net: number;
  /** Minutes per month at which that net exactly covers marginal cost. */
  minutes: number;
  /** The plan's advertised allowance. */
  allowance: number | null;
  /**
   * Fraction of the allowance a subscriber can use before the plan loses money.
   * Below 1 means the plan is underwater for anyone who uses what they bought.
   */
  utilisation: number | null;
}

/**
 * Where each plan stops making money.
 *
 * This is the number the pricing decision actually turns on, and it was not
 * computed anywhere: the cost model priced minutes, the plans sold allowances,
 * and nothing compared the two. At the current marginal cost a $9 plan covers
 * about 56 minutes, while advertising 300 — so a subscriber who uses what they
 * were sold costs several times what they pay.
 *
 * That is survivable while average use sits far below the allowance, which is the
 * ordinary shape of a subscription. It is worth watching precisely because this
 * product is built to raise engagement: every improvement that gets somebody to
 * come back for the next task moves average use toward the allowance, and the
 * better it works the worse this gets. `plan_usage` has the real distribution
 * after a month of traffic; until then this is the guardrail.
 */
export function breakEven(
  input: CostInputs,
  plans: readonly { id: string; name: string; priceMinor: number; monthlyMinutes: number | null }[],
): BreakEven[] {
  const marginal = project(input).marginalPerMinute;

  return plans
    .filter((p) => p.priceMinor > 0)
    .map((p) => {
      const price = p.priceMinor / 100;
      const net = price * (1 - input.processorRate) - input.processorFixed;
      const minutes = marginal > 0 ? net / marginal : 0;
      return {
        planId: p.id,
        planName: p.name,
        price,
        net,
        minutes,
        allowance: p.monthlyMinutes,
        utilisation: p.monthlyMinutes ? minutes / p.monthlyMinutes : null,
      };
    });
}

// -------------------------------------------------------------- scenarios ---

export interface Scenario {
  id: string;
  name: string;
  /** Minutes per user per month. */
  minutesPerUser: number;
  note: string;
}

/**
 * Three intensities to compare a projection against. The point of showing them
 * side by side is that the same headcount can cost wildly different amounts:
 * usage, not user count, is what drives the bill.
 */
export const SCENARIOS: readonly Scenario[] = [
  { id: 'light', name: 'Ligero', minutesPerUser: 20, note: '2 consultas cortas al mes' },
  { id: 'medium', name: 'Medio', minutesPerUser: 60, note: 'una consulta por semana' },
  { id: 'heavy', name: 'Intenso', minutesPerUser: 160, note: 'uso casi diario' },
] as const;

// -------------------------------------------------------------- formatting --

/** Money, to the cent, for a Chilean reader: dot for thousands, comma for cents. */
export function usd(value: number, decimals = 2): string {
  return `US$${value.toLocaleString('es-CL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** Prices below a dollar need more precision than a total does. */
export function usdPrecise(value: number): string {
  return `US$${value.toLocaleString('es-CL', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })}`;
}

export function number(value: number, decimals = 0): string {
  return value.toLocaleString('es-CL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/* ------------------------------------------------- am I on the right tier? */

/**
 * The smallest monthly saving worth telling somebody about.
 *
 * `elevenLabsCost` will happily report that Starter beats Creator by four
 * dollars in a quiet month, and acting on that means a downgrade, a tighter
 * concurrency ceiling and an overage line the moment usage recovers. A check
 * that fires on noise gets ignored, and then it is not there for the month it
 * matters.
 */
export const TIER_ADVICE_FLOOR = 10;

export interface TierAdvice {
  /** The tier actually subscribed to, or null when the name was not recognised. */
  current: ElevenLabsTier | null;
  /** The cheapest commercial tier for this many minutes. */
  best: ElevenLabsTier;
  /** What the current tier costs this month, subscription plus overage. */
  currentTotal: number | null;
  bestTotal: number;
  /** Money left on the table each month. Never negative. */
  saving: number;
  /** Past `TIER_ADVICE_FLOOR`, and actually a different tier. */
  worthMoving: boolean;
  /** Simultaneous conversations given up (negative) or gained by moving. */
  concurrencyChange: number | null;
  /**
   * True when the subscription forbids commercial use, which the free tier
   * does. Separate from the money: a deployment taking payments on it is a
   * licensing problem and no saving makes that the right tier.
   */
  nonCommercial: boolean;
}

/**
 * Whether the ElevenLabs subscription matches what is actually being used.
 *
 * Nothing asked this before, and it went unasked for over a month while the
 * account sat on Pro — $99 for 1,238 included minutes — against a busiest month
 * of 226. Creator serves that for $22. Every check in this repo was green
 * throughout, correctly: an over-provisioned subscription is not a fault, it
 * works perfectly, it just costs about $920 a year more than it needs to.
 *
 * It is worth checking every month rather than once, because the ladder has no
 * volume discount — every tier is priced at exactly the $0.08 overage rate
 * times its included minutes — so a higher tier buys nothing but concurrency.
 * The right tier is therefore the cheapest one whose concurrency you need, and
 * that answer moves with usage in both directions.
 *
 * Pure, so the doctor and /admin/costos can share one answer: they had a copy
 * of the ladder each once already.
 */
export function tierAdvice(
  subscribedTierId: string | null,
  minutes: number,
  overagePerMinute: number,
): TierAdvice {
  const current =
    ELEVENLABS_TIERS.find((t) => t.id === subscribedTierId?.trim().toLowerCase()) ?? null;

  const best = elevenLabsCost(minutes, overagePerMinute, 'auto');
  const currentCost = current
    ? elevenLabsCost(minutes, overagePerMinute, current.id)
    : null;

  const saving = currentCost ? Math.max(0, currentCost.total - best.total) : 0;

  return {
    current,
    best: best.tier,
    currentTotal: currentCost?.total ?? null,
    bestTotal: best.total,
    saving,
    worthMoving: Boolean(current) && current!.id !== best.tier.id && saving >= TIER_ADVICE_FLOOR,
    concurrencyChange: current ? best.tier.concurrency - current.concurrency : null,
    nonCommercial: current ? !current.commercial : false,
  };
}
