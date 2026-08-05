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

  /** Flat monthly cost of the database. */
  supabaseMonthly: number;
  /** Flat monthly cost of hosting and bandwidth. */
  vercelMonthly: number;
}

/**
 * Defaults derived in `docs/pricing.md` §1, from this repository's own agent
 * configuration: a 17,791-character system prompt and `max_documents_length` of
 * 12,000 characters, against Claude Sonnet 4.5 list pricing.
 */
export const DEFAULT_INPUTS: CostInputs = {
  users: 30,
  minutesPerUser: 60,

  turnsPerMinute: 2,
  inputTokensPerTurn: 9_100,
  outputTokensPerTurn: 200,
  inputPricePerMTok: 3,
  outputPricePerMTok: 15,

  elevenLabsOveragePerMinute: 0.08,
  elevenLabsTierId: 'auto',

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

  elevenLabs: ElevenLabsCost;
  llm: number;
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

  const elevenLabs = elevenLabsCost(
    totalMinutes,
    input.elevenLabsOveragePerMinute,
    input.elevenLabsTierId,
  );
  const llm = llmPerMinute * totalMinutes;
  const total = elevenLabs.total + llm + input.supabaseMonthly + input.vercelMonthly;

  return {
    totalMinutes,
    llmPerMinute,
    elevenLabs,
    llm,
    supabase: input.supabaseMonthly,
    vercel: input.vercelMonthly,
    total,
    // Once the subscription's included minutes are gone, one more minute costs
    // an overage minute plus its inference. Below that line it is inference
    // only, which is the cheaper and less useful number to plan with.
    marginalPerMinute: input.elevenLabsOveragePerMinute + llmPerMinute,
    costPerUser: input.users > 0 ? total / input.users : 0,
    averagePerMinute: totalMinutes > 0 ? total / totalMinutes : 0,
    concurrency: elevenLabs.tier.concurrency,
  };
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
