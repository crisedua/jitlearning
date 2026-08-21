/**
 * Every gate between deciding to pay and having the plan.
 *
 * Fourth and last list of this kind. The offer had three gates, the classroom
 * eight, the aftermath six. This one decides whether the product is a business,
 * and it is the path where a silent failure costs the most: somebody has handed
 * over money and received nothing, and the only person who knows is them.
 *
 * Ten gates. Three of them exist to degrade gracefully while Stripe is
 * unconfigured, which is the state this deployment is in and the state every
 * early sale will happen in, so they are as real as the rest.
 */
import assert from 'node:assert/strict';
import { LEVELS, WEEKLY_MAX, WEEKLY_MIN } from './curriculum';
import { approximateSessions, FALLBACK_PLANS, formatMinutes } from './plans';
import { dominatedBy } from './plans';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), 'utf8');

describe('the gates between wanting to pay and having a plan', () => {
  const planes = read('src', 'app', 'planes', 'page.tsx');
  const progreso = read('src', 'app', 'progreso', 'page.tsx');
  const checkout = read('src', 'app', 'api', 'checkout', 'route.ts');
  const hook = read('src', 'app', 'api', 'webhooks', 'stripe', 'route.ts');
  const billing = read('src', 'lib', 'billing.ts');

  /*
   * The condition was `if (buyable)` — Stripe alone — and that was both the
   * gate and a bug: the Mercado Pago button lived inside it, so the rail this
   * product is actually sold on could not appear without the one its market does
   * not use. What this gate is for survives the fix and is now stated properly:
   * the page writes to a person when it can complete *no* checkout, not when it
   * cannot complete Stripe's.
   */
  it('1. no checkout at all: /planes writes to a person instead of a dead button', () => {
    assert.match(planes, /if \(buyable \|\| mpBuyable\) \{/);
    assert.match(planes, /IntentLink/, 'the fallback no longer records that somebody tried');
  });

  it('1b. either rail alone is enough to show a button', () => {
    // Each provider's button carries its own condition. Nesting one inside the
    // other is the failure above, and it is invisible: both providers healthy,
    // every buyer sent to WhatsApp, nothing logged anywhere.
    assert.match(planes, /\{buyable && \(/, 'the Stripe button is no longer independently gated');
    assert.match(planes, /\{mpBuyable && /, 'the Mercado Pago button is no longer independently gated');
    assert.match(
      planes,
      /mpConfigured\(\) \? selfServe\.filter\(\(p\) => p\.mpPriceMinor !== null\)/,
      'mpBuyable no longer derives from the Mercado Pago token and a peso price',
    );
  });

  it('2. no Stripe: the offer under the hours does the same', () => {
    assert.match(progreso, /buyable \? \(/);
    assert.match(progreso, /channel="whatsapp"/);
  });

  it('3. no Stripe: somebody already paying is told how to reach a person', () => {
    assert.match(progreso, /billingConfigured\(\) \? \(\s*<BillingLink/);
  });

  it('4. not signed in: refused before a session is minted', () => {
    assert.match(checkout, /status: 401/);
  });

  it('5. a tampered plan: the price comes from the server, never the request', () => {
    assert.match(checkout, /purchasablePlan/);
    assert.doesNotMatch(checkout, /body\.(price|amount)/, 'a price from the request would be chargeable');
  });

  it('6. no profile row: refused loudly, because the webhook matches on it later', () => {
    assert.match(billing, /could not attach customer/);
  });

  it('7. an unsigned webhook is refused', () => {
    assert.match(hook, /Missing stripe-signature/);
    assert.match(hook, /Invalid signature/);
  });

  it('8. a redelivery is claimed once, and claimed is not handled', () => {
    assert.match(hook, /claimEvent\(event\)/);
    assert.match(billing, /handled_at/);
  });

  it('9. the plan write matching no row fails the delivery, so Stripe retries', () => {
    // The comment in `applySubscription` says a webhook that cannot write must
    // return non-2xx or somebody has paid for nothing. A zero-row update is that
    // case and used to return cleanly.
    assert.match(billing, /No profile for customer/);
    assert.match(hook, /status: 500/, 'a failed handler no longer asks Stripe to retry');
  });

  it('10. a paid customer is never labelled a courtesy', () => {
    assert.match(billing, /export function isComped/);
    assert.match(progreso, /isComped\(subscription\)/);
  });
});

/*
 * The feedback deal withdraws itself when the seats are gone.
 *
 * `grantFeedbackPlan` refuses the eleventh grant, because ten is a number
 * printed on a public page and a number on a public page should be true. The
 * page did not know that: with the seats used it went on promising three months
 * to anybody who wrote, and `seatsLeft` — which exists and is correct — was read
 * only by the admin screen.
 *
 * The headline is the part that matters. Making only the confirmation
 * conditional would be worse than leaving it alone: somebody reads "tu feedback
 * vale 3 meses", writes for ten minutes about what did not work, and is told
 * afterwards that the seats went. A promise has to be withdrawn before the
 * effort, not after it.
 */
describe('the feedback deal when the seats run out', () => {
  const page = read('src', 'app', 'feedback', 'page.tsx');
  const form = read('src', 'components', 'FeedbackForm.tsx');

  it('asks how many are left', () => {
    assert.match(page, /seatsLeft\(await listGrants\(\)\) > 0/);
  });

  it('withdraws the headline, not just the thank-you', () => {
    assert.match(page, /seatsOpen \? \(/, 'the promise above the form is unconditional again');
    assert.match(page, /cupos ya se usaron/);
  });

  it('still asks for the feedback', () => {
    // Somebody arriving after the tenth person is worth hearing from, and the
    // honest version of asking is asking without dangling a plan.
    assert.match(page, /Tu feedback sigue sirviendo/);
    assert.match(form, /esto no viene con plan/);
  });
});

/*
 * The learner who ran out before the task closed.
 *
 * `timeSaved` counts only finished weekly steps, deliberately: a plan somebody
 * can edit into "done" measures nothing. So a first session that runs out of
 * minutes mid-task leaves a step at `in_progress`, and the numbers the learner
 * types afterwards count for nothing — which is correct, and left them reading
 * "entra en tu total cuando la clase dé este paso por hecho" with no minutes to
 * have that class and no offer on the page, because the offer needs a saving.
 *
 * An instruction somebody cannot follow, on the one screen that sells.
 */
describe('the minutes box when the free tier is spent', () => {
  const progreso = read('src', 'app', 'progreso', 'page.tsx');

  it('knows whether there are minutes left', () => {
    assert.match(progreso, /outOfMinutes=\{minutesLeft\(balance\) === 0\}/);
  });

  it('points at the plans instead of at a class they cannot have', () => {
    assert.match(
      progreso,
      /outOfMinutes \? \([\s\S]{0,400}href="\/planes"/,
      'the note still tells a learner with no minutes to go and have a class',
    );
  });

  it('keeps the ordinary instruction for somebody who still has minutes', () => {
    assert.match(progreso, /Entra en tu total cuando la clase dé este paso por hecho/);
  });
});

/*
 * The offer says how many tasks its number came from.
 *
 * `timeSaved().perWeek` is the sum across every weekly task a learner has
 * measured, and the offer read "con una sola tarea ya recuperas X" whatever X
 * was made of. Somebody who measured three read a three-task total attributed to
 * one, on the screen that asks them for money.
 *
 * The persona is told, in as many words, that the number is the learner's and
 * must not be inflated or estimated for them. The page that sells against that
 * number was doing exactly that.
 */
describe('the offer under the measured hours', () => {
  const progreso = read('src', 'app', 'progreso', 'page.tsx');

  it('counts the tasks its total came from', () => {
    assert.match(
      progreso,
      /saved\.tasksMeasured === 1\s*\?[\s\S]{0,160}Con una sola tarea/,
      'the offer attributes a multi-task total to one task again',
    );
    assert.match(progreso, /Con \$\{saved\.tasksMeasured\} tareas/);
  });

  it('still quotes the number the learner produced, not a derived one', () => {
    // `perWeek` is theirs. Nothing here may scale it, project it, or annualise
    // it — the whole argument is that the figure came out of their own mouth.
    assert.doesNotMatch(progreso, /perWeek \* |perWeek \/ |perWeek \+ /);
  });
});

/*
 * The promise the price is attached to.
 *
 * The offer says the plan's minutes reach "las 3 a 5 tareas de tu semana y los
 * otros 3 niveles, hasta el portafolio". That sentence is arithmetic between
 * three constants that live in three files and never meet: the plan's monthly
 * minutes, how long a class is, and how many weekly tasks the curriculum
 * claims. Nothing compared them.
 *
 * They did not add up. At the 15 minutes the site used to advertise, a 300
 * minute allowance is 20 classes, against 21 weekly tasks at the top of the
 * claimed range — short before the other levels are counted at all. The
 * sentence asking for money was promising an allowance that could not cover
 * what it described.
 *
 * It holds now only because a class is 10 minutes. That is exactly the kind of
 * thing that comes undone the next time one of the three moves.
 */
describe('the allowance against what the offer promises it covers', () => {
  const WEEKS_PER_MONTH = 4.345;

  it('covers the weekly tasks at the top of the claimed range, and then some', () => {
    for (const plan of FALLBACK_PLANS.filter((p) => p.priceMinor > 0 && p.isPublic)) {
      const classes = approximateSessions(plan.monthlyMinutes);
      assert.ok(classes !== null, `${plan.name} has no countable classes`);

      const tasksAtTop = Math.floor(WEEKLY_MAX * WEEKS_PER_MONTH);
      assert.ok(
        classes > tasksAtTop,
        `${plan.name}: ${formatMinutes(plan.monthlyMinutes)} is ${classes} classes, but the ` +
          `offer promises ${WEEKLY_MIN} to ${WEEKLY_MAX} weekly tasks (${tasksAtTop} a month) ` +
          'plus the other levels',
      );
    }
  });

  it('leaves room for the levels beyond the weekly task', () => {
    // The sentence names them: "y para los otros N niveles, hasta el portafolio".
    const plan = FALLBACK_PLANS.find((p) => p.id === 'founder')!;
    const spare = approximateSessions(plan.monthlyMinutes)! - Math.floor(WEEKLY_MAX * WEEKS_PER_MONTH);
    assert.ok(
      spare >= LEVELS.length - 1,
      `only ${spare} class(es) left for ${LEVELS.length - 1} further levels`,
    );
  });
});

/*
 * A dominated tier is only honest while the page refuses to sell it.
 *
 * Estándar costs twice Fundador and gives the same 300 minutes. That is
 * deliberate: it is the standing price, shown so the founder discount reads as
 * a discount. What makes it honest rather than a trap is that /planes demotes
 * it to a list price with no button and tells the reader to take the cheaper
 * one.
 *
 * So the arrangement is fine and the demotion is load-bearing. If a dominated
 * tier ever gets a checkout button back, the page is asking somebody to pay
 * more for less.
 */
describe('the tier that costs more and gives the same', () => {
  const paid = FALLBACK_PLANS.filter((p) => p.isPublic && p.priceMinor > 0);

  it('is recognised as dominated rather than quietly offered', () => {
    const dominated = paid.filter((p) => dominatedBy(p, paid) !== null);
    for (const plan of dominated) {
      const by = dominatedBy(plan, paid)!;
      assert.ok(
        by.priceMinor < plan.priceMinor,
        `${plan.name} is superseded by something dearer, which is not a discount`,
      );
    }
  });

  it('loses its button and its recommendation ring on the page', () => {
    const planes = read('src', 'app', 'planes', 'page.tsx');
    // The button only renders when there is no `supersededBy`.
    assert.match(planes, /supersededBy \?[\s\S]{0,400}<PlanAction/);
    assert.match(planes, /const recommended = !supersededBy/);
  });

  it('tells the reader to buy the cheaper one instead', () => {
    const planes = read('src', 'app', 'planes', 'page.tsx');
    assert.match(planes, /te da lo\s*\n?\s*mismo, así que toma ese/);
  });
});
