# Pricing

What a minute of coaching costs, what 30 people cost, and why the tiers are the
sizes they are. The tiers themselves live in
`supabase/migrations/20260803000000_pricing_tiers.sql` — this file is the
arithmetic behind them, so that when a number changes it is obvious what else
has to move.

Every figure below is derived from this repository's own configuration and
published list prices. Nothing here is a quote, and none of it is a measurement:
there is no production traffic yet. The first month of real
`coach_sessions.duration_seconds` should replace the two assumptions flagged as
such.

---

## 1. The unit is a spoken minute

A minute of conversation is billed on two meters at once, and both scale with
talk time and nothing else.

### ElevenLabs — $0.080 / min

Every Agents tier bills overage at **$0.08/min**, so that is the marginal cost
of a minute regardless of which subscription is underneath it. Included minutes
per tier:

| Tier | $/mo | Included min | Concurrency |
|---|---:|---:|---:|
| Free | 0 | 15 | 4 |
| Starter | 6 | 75 | 6 |
| Creator | 22 | 275 | 10 |
| Pro | 99 | 1,238 | 20 |
| Scale | 299 | 3,738 | 30 |
| Business | 990 | 12,375 | 40 |

Going over the concurrency limit is billed at **$0.16/min**, double. With 30
users, Pro's 20 concurrent sessions is the first ceiling worth watching — it is
reached by 21 people talking *simultaneously*, not by 21 people having accounts.

### The LLM — ~$0.061 / min

**ElevenLabs bills the LLM separately.** It is not covered by the included
minutes; it is deducted from credits at cost. The agent runs
`claude-sonnet-4-5` (`ELEVENLABS_AGENT_LLM`), at $3.00 / $15.00 per million
input / output tokens.

Per model turn, measured from `src/lib/agent.ts`:

| Component | Source | ≈ tokens |
|---|---|---:|
| System prompt | `tutorSystemPrompt()`, 17,791 chars | 5,100 |
| Retrieved RAG context | `max_documents_length: 12_000` chars, typical fill | 2,000 |
| Conversation history | mid-session average | 2,000 |
| **Input total** | | **9,100** |
| Output | ~130 spoken words | 200 |

At **2 model turns per minute** (a ~30-second question-and-answer cycle):

    input   18,200 tok × $3/M   = $0.0546
    output     400 tok × $15/M  = $0.0060
                                  ────────
                                  $0.061 / min

**Assumption to replace with data:** the 2 turns/minute figure and the 2,000-token
history average are estimates. `coach_sessions.message_count` and
`duration_seconds` together give the real turn rate after one month of use.

**Possible upside, unverified:** the system prompt is 5,100 stable tokens at the
front of every request — well above the 1,024-token minimum for prompt caching.
If ElevenLabs caches it, that component drops from $0.0306 to ~$0.003/min and
the LLM total falls to ~$0.033/min. This model assumes it does **not**, because
that cannot be checked from outside. If it turns out to cache, every margin
below improves; none of them gets worse.

### Marginal cost

    $0.080  ElevenLabs
    $0.061  LLM
    ──────
    $0.141  per spoken minute      →  $0.14 is the number to price against

### Fixed monthly costs

| Item | $/mo | Why not the free tier |
|---|---:|---|
| Vercel Pro | 20 | Hobby forbids commercial use |
| Supabase Pro | 25 | Free projects pause when idle, and have no backups |
| **Total** | **45** | |

Both are flat across 30 users; neither becomes a constraint at this size.

---

## 2. What 30 people cost

Three intensities, 30 users each. The ElevenLabs line always picks the cheaper
of (smaller tier + overage) and (next tier up) — at these volumes overage on a
smaller plan usually wins.

| | Light<br>20 min/user | Medium<br>60 min/user | Heavy<br>160 min/user |
|---|---:|---:|---:|
| Total minutes | 600 | 1,800 | 4,800 |
| ElevenLabs | $70<br><sub>Creator + 325 over</sub> | $144<br><sub>Pro + 562 over</sub> | $384<br><sub>Scale + 1,062 over</sub> |
| LLM | $37 | $110 | $293 |
| Vercel + Supabase | $45 | $45 | $45 |
| **Total** | **$152** | **$299** | **$722** |
| **Per user** | **$5.05** | **$9.96** | **$24.06** |

The spread is the whole point: the same 30 accounts cost between $152 and $722
depending only on how much they talk. That is why the plans meter minutes rather
than charging one price for a seat.

---

## 3. The tiers

Two utilisation cases are shown for each: **expected** at 65% of the allowance
(nobody uses a metered allowance in full), and **worst** at 100%. No tier loses
money in the worst case — that is the constraint the prices were solved for.

| Plan | Price | Minutes | Sessions | Expected cost | Margin | Worst cost | Margin | Overage |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Gratis | $0 | 20 | 3 | — | — | $2.80 | — | none |
| Esencial | $19 | 60 | ∞ | $5.46 | 71% | $8.40 | 56% | $0.35/min |
| Profesional | $49 | 180 | ∞ | $16.38 | 67% | $25.20 | 49% | $0.35/min |
| Intensivo | $99 | 400 | ∞ | $36.40 | 63% | $56.00 | 43% | $0.30/min |
| Equipo *(per seat, min 10)* | $35 | 120 | ∞ | $10.92 | 69% | $16.80 | 52% | $0.30/min |

Prices are USD. They are stored in `plans.price_minor` as cents, with
`plans.currency`; a CLP price list is a second set of rows, not a conversion in
code — see §6.

### Why these shapes

**Gratis stops rather than overflows.** `overage_minor_per_min` is NULL on the
free tier, which the migration defines as a hard stop. A free account that can
bill is a free account that can be pointed at a script. 20 minutes is about two
real sessions: enough to learn whether the coach knows your subject, not enough
to be the answer.

**Gratis is also the largest uncontrolled cost here.** Each free account is worth
up to $2.80/month of *unrecoverable* spend. 100 signups is $280/month with no
revenue attached — more than the entire medium-intensity 30-user scenario above.
If free signups outrun conversions, this is the number that moves first, and the
lever is the 20 minutes, not the tiers.

**Overage is priced at 2.1–2.5× cost, not at cost.** It is a signal that the plan
is the wrong size, not a revenue line. Priced at cost it becomes a cheaper way to
buy minutes than upgrading, and nobody upgrades.

**Esencial → Profesional triples the minutes for 2.6× the price**, and
Profesional → Intensivo adds 2.2× for 2×. Each step up gets cheaper per minute,
so the upgrade is always the rational move before heavy overage — which is what
you want, because a subscription is predictable revenue and overage is not.

**Equipo is per seat with a 10-seat floor**, and is `is_public = false`: it is
sold, not self-serve. At $35 for 120 minutes it is a ~8% discount on two
Esenciales, which is enough to be worth asking for and not enough to make it
worth buying one seat at a time.

### A revenue picture at 30 paying users

A plausible mix — 18 Esencial, 10 Profesional, 2 Intensivo:

| | Expected (65% use) | Worst (100% use) |
|---|---:|---:|
| Revenue | $1,030 | $1,030 |
| Minutes | 2,392 | 3,680 |
| ElevenLabs | $191 | $294 |
| LLM | $146 | $224 |
| Vercel + Supabase | $45 | $45 |
| **Cost** | **$382** | **$564** |
| **Gross margin** | **63%** | **45%** |

Break-even, on Creator ($22) plus the $45 of fixed cost, is **5 Esencial
subscribers**. Moving to ElevenLabs Pro at ~1,200 minutes/month raises that
floor to about 11.

---

## 4. What the migration changes

`plans` gains `price_minor`, `currency`, `overage_minor_per_min`, `seat_minimum`,
`is_public`, `sort_order` and `blurb`; the four paid tiers are inserted; and
`free` is updated from unlimited (its placeholder value) to 20 minutes / 3
sessions with no overage.

It also adds a `plan_usage` view — current-month minutes and sessions per user,
joined to their plan's limits. It reports two totals:

- `synced_minutes` counts only rows `npm run sync:usage` has reconciled against
  ElevenLabs. **Bill on this one.** A browser-reported duration is a claim.
- `minutes` counts everything including unreconciled rows. **Show the learner
  this one** — a session that ended twenty seconds ago is real to them.

The view is `security_invoker = on`, so it runs as its caller and inherits the
existing `read own sessions` policy on `coach_sessions`. Without that it would
run as the definer and hand every learner everyone else's usage.

---

## 5. Still to build

The migration prices the plans; it does not enforce them. In order:

1. **Read the limit before connecting.** `src/app/api/signed-url/route.ts` is the
   single choke point — no signed URL, no session. Check `plan_usage` there.
2. **Show the balance.** A learner who hits a wall they could not see coming
   reads it as a bug. Minutes remaining belongs on `/coach`, before the button.
3. **Run `sync:usage` on a schedule.** Until it runs, every number is
   self-reported. A Vercel cron hitting a route that calls it is enough.
4. **Payment.** Nothing here touches Stripe. `plans.price_minor` is the source of
   truth for what to charge; the Stripe price id belongs in a column next to it,
   not in application code.

A limit that is only checked at connection time lets a session that has already
started run past the allowance. That is deliberate — cutting someone off
mid-sentence to save $0.14 is the wrong trade — but it means the cap is soft by
roughly one session's length, and the numbers above already assume it.

## 6. On currency

The tiers are stored in USD because both upstream costs are USD, and an
exchange-rate move should not silently eat the margin.

Selling in CLP is a **second set of rows** with `currency = 'CLP'` and
`price_minor` in whole pesos — not a conversion applied in application code. A
rate baked into code becomes wrong quietly, and quietly wrong is how a 63% margin
becomes a 40% one without anyone noticing. Chile also charges 19% IVA on digital
services; a CLP list price is normally quoted with IVA included, and the numbers
in §3 are all pre-tax.
