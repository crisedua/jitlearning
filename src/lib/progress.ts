/**
 * What the teacher knows before the learner says a word, and what the progress
 * page renders afterwards.
 *
 * Two directions. `applyConversation` turns the fields ElevenLabs extracted from
 * a finished call into rows: the profile, the plan, the step that advanced, the
 * session record. `learnerRecord` reads them back into the three dynamic
 * variables the agent is started with.
 *
 * ## No LLM of ours
 *
 * Every field written here came out of the transcript on the ElevenLabs side
 * (`dataCollection` in `agent.ts`). The plan itself is not generated at all: it
 * is `buildPlan` in `curriculum.ts`, a deterministic join of the fixed
 * curriculum with the tasks and path the diagnostic collected. That is what
 * makes the plan on screen the same plan the teacher is working through.
 *
 * ## Why the record has a hard character budget
 *
 * It rides on the conversation as a dynamic variable, so it is paid for on every
 * turn in latency and tokens, and past a certain size it stops being read: a
 * model given three paragraphs of history and one question answers the question.
 * 800 characters is enough for "you are an operations analyst, step 4 of 11, you
 * owe me a weekly summary", which is all the opening needs.
 *
 * ## Everything here fails soft
 *
 * A deployment that has not run the migration still works, cold. A missing table
 * (42P01) or column (42703) degrades to a first session rather than to an error
 * the learner sees, because a teacher with no memory is worse, not broken.
 */
import type { ConversationDetail } from './elevenlabs';
import {
  buildPlan,
  isWeeklyTask,
  LEVELS,
  lessonById,
  type LevelId,
  type PathId,
  type PlannedStep,
} from './curriculum';
import { OPENING_FIRST, OPENING_RETURN_FALLBACK } from './teacher';
import { spellMinutes } from './plans';
import { serviceConfigured, supabaseAdmin } from './supabase/admin';
import { withDeadline } from './deadline';

/** Postgres: undefined table, undefined column. Both mean "migration pending". */
const MISSING_TABLE = '42P01';
const MISSING_COLUMN = '42703';

function pending(code: string | undefined): boolean {
  return code === MISSING_TABLE || code === MISSING_COLUMN;
}

/** The whole injected record. See the note above on why this is capped. */
const RECORD_CHARS = 800;

/** One line of the record, and what it is worth when the budget runs out. */
interface RecordLine {
  text: string;
  /** Lower goes first. See `KEEP`. */
  keep: number;
}

/**
 * What the teacher can least afford to lose, in the persona's own order.
 *
 * "Lo primero que vale de ese registro es el compromiso", so that outranks
 * everything; then what the session is for; then the saving, which is what the
 * opening is told it may lead with; then how long it has been. Context about who
 * the learner is goes last — not because it does not matter, but because
 * `apertura` already carries the part of it that gets said out loud, and it is
 * the only group here made of unbounded learner text.
 */
const KEEP = {
  context: 0,
  days: 1,
  saving: 2,
  plan: 3,
  commitment: 4,
} as const;

/** Per-field cap, so a runaway extraction stays a sentence. */
const FIELD_CHARS = 400;

/** Longest the whole spoken opening may run. Roughly twenty seconds aloud. */
const OPENING_CHARS = 320;

/**
 * Longest stretch of the learner's own words the opening reads back.
 *
 * Roles, step titles and commitments all arrive from extractions capped at
 * `FIELD_CHARS`, and a commitment near that length is most of a minute of the
 * teacher reciting the learner's own sentence back at them before asking
 * anything. These are the budgets that keep the opening two sentences.
 */
const ECHO_WHO = 60;
const ECHO_TITLE = 90;
const ECHO_COMMITMENT = 140;

/**
 * Words that cannot end a spoken phrase. Trimming at a word boundary is not
 * enough: "en una distribuidora de" stops on a preposition still waiting for its
 * object, which sounds like the teacher lost its train of thought rather than
 * like a sentence. Cheap and worth it, since every one of these is heard.
 */
const DANGLING =
  /(?:^|\s)(?:de|del|a|al|en|con|por|para|sin|sobre|y|e|o|u|que|el|la|los|las|un|una|unos|unas|su|sus|mi|mis|lo|le|se|es|más|muy|desde|hasta|entre|tras|como|cuando|donde)$/i;

/**
 * Trim to the last whole word that fits, with no dangling punctuation or
 * connective.
 *
 * Mid-word truncation is invisible in a text field and unmissable when spoken:
 * the teacher stops on half a syllable. Falls back to a hard cut only when the
 * text has no space in its second half, which in practice means one long token.
 */
function toWord(text: string, max: number): string {
  const clean = text.trim();
  let out = clean;
  if (clean.length > max) {
    const cut = clean.slice(0, max);
    const space = cut.lastIndexOf(' ');
    out = space > max / 2 ? cut.slice(0, space) : cut;
  }
  out = out.replace(/[\s.,;:]+$/, '');
  // Loop: trimming "a mano y" leaves "a mano", and "de la" leaves nothing twice.
  while (DANGLING.test(out)) {
    out = out.slice(0, out.search(/\s\S+$/)).replace(/[\s.,;:]+$/, '');
    if (!out.includes(' ')) break;
  }
  return DANGLING.test(out) && !out.includes(' ') ? '' : out;
}

export interface CareerProfile {
  role: string | null;
  field: string | null;
  sector: string | null;
  experienceYears: number | null;
  weeklyTasks: string[];
  tools: string[];
  aiUsage: string | null;
  goal: string | null;
  chosenPath: PathId | null;
  map: { value?: string; categories?: string; paths?: string };
  updatedAt: string | null;
}

export interface PlanStep {
  id: string;
  lessonId: string;
  level: LevelId;
  title: string;
  linkedTask: string | null;
  status: 'pending' | 'in_progress' | 'done';
  evidence: string | null;
  commitment: string | null;
  commitmentDate: string | null;
  position: number;
  /** Minutes this weekly task took before, as the learner reported it. */
  minutesBefore: number | null;
  /** Minutes the same task took with what they built. */
  minutesAfter: number | null;
}

/**
 * What the learner's own numbers add up to.
 *
 * `perWeek` is the sum over finished weekly tasks of before minus after. It is not
 * an average, not a benchmark, and not ours: it is their measurement of their own
 * week, which is the only reason it is worth showing.
 *
 * There is deliberately no cumulative "hours saved since you started". It would
 * be the weekly figure multiplied by weeks elapsed — an estimate stacked on a
 * self-report, and by far the most impressive number here, which is exactly why
 * it is the one to leave out. The recurring figure is already enough to make the
 * price an arithmetic problem, and it is defensible line by line.
 */
export interface TimeSaved {
  perWeek: number;
  tasksMeasured: number;
}

export interface SessionRecord {
  id: string;
  createdAt: string;
  lessonId: string | null;
  taught: string | null;
  commitment: string | null;
  commitmentDate: string | null;
  commitmentDone: boolean | null;
}

/**
 * A commitment whose date has passed and that nobody has answered for.
 *
 * The date is extracted from the conversation and stored, and the notebook
 * showed only the text — so a deadline this product collected sat unused while
 * `/coach` displayed the same one. The commitment is what brings somebody back
 * between sessions; a notebook that knows a date has passed and says nothing is
 * a reminder declined.
 *
 * Compared as date strings rather than as `Date` objects. `commitment_date` is
 * a plain YYYY-MM-DD, and turning it into a timestamp makes "today" depend on
 * the server's timezone, which is how one commitment reads as overdue in
 * Santiago and not in Madrid. The learner keeps the whole of the day they asked
 * for.
 */
export function isOverdue(session: SessionRecord, today = new Date()): boolean {
  if (!session.commitmentDate || session.commitmentDone !== null) return false;
  return session.commitmentDate < today.toISOString().slice(0, 10);
}


// ---------------------------------------------------------------- extraction

/**
 * The analysis half of a finished call: the summary and the extracted fields.
 *
 * Everything here takes this rather than a whole `ConversationDetail`, because
 * the webhook payload is not one. Narrowing the parameter is what lets the
 * webhook pass what it actually has instead of casting a partial object into a
 * shape it does not have.
 */
export type CallAnalysis = ConversationDetail['analysis'];

/** One extracted field, trimmed and capped, or null when the extractor found nothing. */
function field(analysis: CallAnalysis, name: string): string | null {
  const raw = analysis?.data_collection_results?.[name]?.value;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Guard against an extractor that answers the prompt instead of obeying it.
  if (/^(n\/?a|none|ninguno|ninguna|sin datos|no aplica)$/i.test(trimmed)) return null;
  return trimmed.slice(0, FIELD_CHARS);
}

/** Semicolon-separated extraction into an array, since the extractor emits text. */
function list(analysis: CallAnalysis, name: string): string[] {
  return (field(analysis, name) ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
}

/**
 * A minute count the extractor produced, or null.
 *
 * Bounded at 40 hours, matching the column's own check: a single weekly task that
 * eats a whole working week is the largest figure that can be true, and past that
 * it is a misheard number rather than a very slow task. One bad transcription
 * would otherwise put hundreds of saved hours on the progress page, which is the
 * kind of error that destroys the credibility of every other number on it.
 */
function minutes(analysis: CallAnalysis, name: string): number | null {
  return parseMinutes(field(analysis, name));
}

/** Nobody's weekly task takes more than forty hours. Past this it is a misread. */
const MAX_MINUTES = 2_400;

function bound(value: number): number | null {
  if (!Number.isFinite(value) || value < 0 || value > MAX_MINUTES) return null;
  return Math.round(value);
}

/**
 * Minutes, out of whatever the extractor wrote.
 *
 * ## Why not strip the non-digits
 *
 * That is what this did, and concatenating every digit in the string turns
 * "45.5" into 455 and "2,5" into 25. Both pass the range check. On
 * `minutes_before` that is a tenfold inflation of the saving, in the flattering
 * direction, on the number the product's entire value claim rests on and which
 * is supposed to be the learner's own. There is no worse place in this codebase
 * for a silently plausible wrong answer.
 *
 * So: the first number in the string, with a decimal part respected rather than
 * appended, and hours handled because "una hora y media" is how a Spanish
 * speaker says ninety minutes and the extractor sometimes writes it back that
 * way despite being asked for minutes.
 */
export function parseMinutes(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const text = raw.toLowerCase();

  // "media hora" is thirty minutes and has no digit in it at all.
  if (/\bmedia\s+hora/.test(text)) return 30;

  const hours = text.match(/(\d+|una?)\s*(?:h\b|h(?=\d)|horas?)/);
  if (hours) {
    const count = /^una?$/.test(hours[1]!) ? 1 : Number(hours[1]);
    const after = text.slice((hours.index ?? 0) + hours[0].length);
    const extra = after.match(/\d+/)
      ? Number(after.match(/\d+/)![0])
      : /\bmedia\b/.test(after)
        ? 30
        : 0;
    return bound(count * 60 + extra);
  }

  const first = text.match(/(\d+)(?:[.,](\d+))?/);
  if (!first) return null;
  return bound(Number(`${first[1]}.${first[2] ?? '0'}`));
}

/** An ISO date, or null. The spoken deadline ("antes del viernes") is not one. */
function isoDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/**
 * Which direction the learner chose. Same formatting tolerance as `readStatus`,
 * and for the same reason: "Mejorar." is not a different answer from "mejorar",
 * and losing it means the plan is built without the direction they picked.
 */
function pathOf(analysis: CallAnalysis): PathId | null {
  const raw = field(analysis, 'chosen_path')
    ?.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '');
  return raw === 'mejorar' || raw === 'moverse' || raw === 'propio' ? raw : null;
}

// ------------------------------------------------------------------- reading

export async function careerProfile(userId: string): Promise<CareerProfile | null> {
  if (!serviceConfigured()) return null;

  const { data, error } = await supabaseAdmin()
    .from('career_profiles')
    .select(
      'role, field, sector, experience_years, weekly_tasks, tools, ai_usage, goal, chosen_path, map, updated_at',
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (!pending(error.code)) console.error('[progress] profile read failed:', error.message);
    return null;
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    role: (row.role as string) ?? null,
    field: (row.field as string) ?? null,
    sector: (row.sector as string) ?? null,
    experienceYears: (row.experience_years as number) ?? null,
    weeklyTasks: (row.weekly_tasks as string[]) ?? [],
    tools: (row.tools as string[]) ?? [],
    aiUsage: (row.ai_usage as string) ?? null,
    goal: (row.goal as string) ?? null,
    chosenPath: (row.chosen_path as PathId) ?? null,
    map: (row.map as CareerProfile['map']) ?? {},
    updatedAt: (row.updated_at as string) ?? null,
  };
}

export async function planSteps(userId: string): Promise<PlanStep[]> {
  if (!serviceConfigured()) return [];

  /*
   * The two minute columns are newer than the table they sit on.
   *
   * `plan_steps` arrives with 20260810000000_teacher_memory.sql;
   * `minutes_before` and `minutes_after` with 20260812000000_hours_saved.sql,
   * two files later in a bundle of nine that gets pasted by hand. A database
   * with the first and not the second holds a complete plan that this function
   * could not read at all: the select failed with 42703, `pending` swallowed it
   * by design, and the caller got an empty array.
   *
   * Empty is not a small degradation here. The notebook renders nothing, so the
   * learner sees no plan; `currentStep` is null; `timeSaved` is zero so no offer
   * appears; and `advanceStep` returns early on `steps.length === 0`, which
   * means no lesson is ever marked done and no minutes are ever written. The
   * plan exists in Postgres the entire time and the product behaves as though
   * the person had never started.
   *
   * So a missing column costs the two numbers, and nothing else.
   */
  const FULL =
    'id, lesson_id, level, title, linked_task, status, evidence, commitment, commitment_date, position, minutes_before, minutes_after';
  const WITHOUT_MINUTES =
    'id, lesson_id, level, title, linked_task, status, evidence, commitment, commitment_date, position';

  type Rows = {
    data: Record<string, unknown>[] | null;
    error: { code?: string; message: string } | null;
  };

  const read = (columns: string) =>
    supabaseAdmin()
      .from('plan_steps')
      .select(columns)
      .eq('user_id', userId)
      .order('position', { ascending: true });

  let { data, error } = (await read(FULL)) as unknown as Rows;

  if (error?.code === MISSING_COLUMN) {
    const retry = (await read(WITHOUT_MINUTES)) as unknown as Rows;
    data = retry.data;
    error = retry.error;
    if (!error) {
      console.error(
        '[progress] plan_steps has no minutes columns; run 20260812000000_hours_saved.sql. ' +
          'The plan renders, nothing can be measured, and no offer will appear.',
      );
    }
  }

  if (error) {
    if (!pending(error.code)) console.error('[progress] plan read failed:', error.message);
    return [];
  }

  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id as string,
      lessonId: row.lesson_id as string,
      level: row.level as LevelId,
      title: row.title as string,
      linkedTask: (row.linked_task as string) ?? null,
      status: row.status as PlanStep['status'],
      evidence: (row.evidence as string) ?? null,
      commitment: (row.commitment as string) ?? null,
      commitmentDate: (row.commitment_date as string) ?? null,
      position: (row.position as number) ?? 0,
      minutesBefore: (row.minutes_before as number) ?? null,
      minutesAfter: (row.minutes_after as number) ?? null,
    };
  });
}

/**
 * The saving, computed from the steps already in hand.
 *
 * Deliberately a pure function over `planSteps` rather than a read of the
 * `weekly_minutes_saved` view: the progress page has the steps anyway, and one
 * source of arithmetic means the headline can never disagree with the rows
 * underneath it. The view exists for the same sum without loading every step.
 *
 * Only finished steps count. A task measured and left pending is a measurement of
 * an experiment, not of a change to somebody's week.
 */
export function timeSaved(steps: readonly PlanStep[]): TimeSaved {
  const measured = steps.filter(
    (s) =>
      s.level === 'semana' &&
      s.status === 'done' &&
      s.minutesBefore !== null &&
      s.minutesAfter !== null,
  );

  const perWeek = measured.reduce(
    (total, s) => total + Math.max((s.minutesBefore ?? 0) - (s.minutesAfter ?? 0), 0),
    0,
  );

  return { perWeek, tasksMeasured: measured.length };
}

export async function sessionHistory(userId: string, limit = 20): Promise<SessionRecord[]> {
  if (!serviceConfigured()) return [];

  const { data, error } = await supabaseAdmin()
    .from('session_summaries')
    .select('id, created_at, lesson_id, taught, commitment, commitment_date, commitment_done')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (!pending(error.code)) console.error('[progress] history read failed:', error.message);
    return [];
  }

  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id as string,
      createdAt: row.created_at as string,
      lessonId: (row.lesson_id as string) ?? null,
      taught: (row.taught as string) ?? null,
      commitment: (row.commitment as string) ?? null,
      commitmentDate: (row.commitment_date as string) ?? null,
      commitmentDone: (row.commitment_done as boolean) ?? null,
    };
  });
}

/** The first step not yet done, with its 1-based position. Null once the plan is finished. */
export function currentStep(steps: readonly PlanStep[]): { step: PlanStep; number: number } | null {
  const index = steps.findIndex((s) => s.status !== 'done');
  if (index === -1) return null;
  return { step: steps[index]!, number: index + 1 };
}

// --------------------------------------------------------- the three variables

export interface LearnerRecord {
  /** The agent's `apertura`: the first thing said out loud. */
  apertura: string;
  /** The agent's `registro`: the compact profile and plan state. */
  registro: string;
  /** The agent's `primera_sesion`: "sí" or "no". */
  primera_sesion: string;
}

/**
 * The three dynamic variables, composed server-side.
 *
 * `apertura` is built here rather than left to the model because a first message
 * is spoken before any LLM turn: an opening that names the step and the
 * commitment cannot be a fixed string, and cannot be trusted to a model
 * remembering to perform it.
 */
export async function learnerRecord(userId: string): Promise<LearnerRecord> {
  const read = Promise.all([
    careerProfile(userId),
    planSteps(userId),
    sessionHistory(userId, 3),
  ]).then(([profile, steps, history]) => buildRecord({ profile, steps, history }));

  /*
   * Slow is handled by the deadline, broken by the catch. Its sibling in the
   * same `Promise.all` already had both.
   *
   * `/api/signed-url` awaits this beside `learnerContext`, and says of that one
   * that it degrades to a cold start rather than ever failing the mint.
   * `learnerContext` earns the claim: a deadline and a catch, added after
   * noticing that one unhandled rejection returns 500 and a learner is told
   * there is no class. This function sits next to it under the same `Promise.all`
   * and had neither, so a rejection here failed the mint the claim was about,
   * and three slow reads held the microphone open with no ceiling.
   *
   * It matters more than the one that was protected. This produces `apertura`,
   * the first sentence spoken out loud, so losing it costs a returning learner
   * their continuation. Being met as a stranger is a bad session. Being told the
   * class cannot start is no session, and they do not press it twice.
   *
   * The fallback is the cold-start record `buildRecord` returns for somebody with
   * no history, which is the same shape a first session gets and is already the
   * best-tested path in this file.
   */
  const cold = () => buildRecord({ profile: null, steps: [], history: [] });

  return withDeadline(read, null, RECORD_DEADLINE_MS)
    .then((record) => {
      if (record) return record;
      console.error('[progress] learner record timed out, opening cold');
      return cold();
    })
    .catch((err) => {
      console.error('[progress] learner record failed, opening cold:', err);
      return cold();
    });
}

/**
 * How long the opening record may take before the class starts without it.
 *
 * Three reads, on the path that mints the credential for a person who has just
 * pressed a microphone button. Longer than `memory.ts` allows its summary,
 * because this one decides the first sentence and is worth waiting a little
 * more for, and still short enough that nobody is left holding a dead button.
 */
const RECORD_DEADLINE_MS = 3_000;

/**
 * The record, decided from what was read rather than from the reads.
 *
 * Split out so `progress.test.ts` can reach it. Everything above this line is
 * three database calls; everything below is the judgement about what the teacher
 * is told, and that judgement decides whether a returning learner is recognised.
 */
export function buildRecord({
  profile,
  steps,
  history,
}: {
  profile: CareerProfile | null;
  steps: readonly PlanStep[];
  history: readonly SessionRecord[];
}): LearnerRecord {
  /*
   * First session means nothing has happened, not "no profile row".
   *
   * This used to branch on the profile alone, and a profile is written only when
   * a call gives the extractor something to write: `upsertProfile` deliberately
   * returns without writing when it learned nothing, so that a session about one
   * task does not blank the diagnostic. A conversation that ends without the
   * learner restating their job leaves `career_profiles` empty and
   * `session_summaries` full.
   *
   * The result was that such a learner was greeted as a stranger on every visit,
   * with the commitment they made last time sitting in the database, unread. For
   * a product whose entire promise is a teacher that remembers you, there is no
   * worse failure, and it is silent: nothing errors, the conversation is
   * perfectly pleasant, and the person quietly concludes it does not work.
   *
   * History is the honest test. If they have talked before, this is not the
   * first time, and whatever is known gets used even when that is only a
   * commitment and a date.
   */
  if (!profile && history.length === 0) {
    return {
      apertura: OPENING_FIRST,
      registro: 'Sin registro previo: es la primera vez que hablas con esta persona.',
      primera_sesion: 'sí',
    };
  }

  /*
   * A blank profile rather than a branch. Every block below is already written
   * to skip what it does not have, so the null case needs no special path: it
   * simply contributes nothing and the plan, the commitment and the dates carry
   * the record on their own.
   */
  const known: CareerProfile = profile ?? {
    role: null,
    field: null,
    sector: null,
    experienceYears: null,
    weeklyTasks: [],
    tools: [],
    aiUsage: null,
    goal: null,
    chosenPath: null,
    map: {},
    updatedAt: null,
  };

  const current = currentStep(steps);
  const lastCommitment = history.find((h) => h.commitment);
  const saved = timeSaved(steps);

  /*
   * The record is budgeted, not sliced.
   *
   * `RECORD_CHARS` used to be a `.slice(0, 800)` over the joined string, spent
   * first-come-first-served — and the order these are assembled in is the order
   * they read best, which is very nearly the reverse of the order they matter
   * in. The profile echo goes first and is three extraction fields long, each
   * capped at `FIELD_CHARS`, so a learner whose role, field and sector came back
   * verbose produced a record that was 800 characters of who they are and
   * nothing else: no saving, no plan, no commitment.
   *
   * That is the whole of what the teacher is told, and the persona opens on the
   * two pieces the slice was reaching last. "Lo primero que vale de ese registro
   * es el compromiso" — and a commitment that fell off the end is a commitment
   * nobody asks about, which is the one behaviour this product sells hardest,
   * failing silently for exactly the learners whose extractions ran long.
   *
   * So each line carries what it is worth, and what does not fit is dropped
   * whole rather than cut mid-sentence.
   */
  const blocks: RecordLine[] = [];
  const context = (text: string) => blocks.push({ text, keep: KEEP.context });

  const who = [known.role, known.field, known.sector].filter(Boolean).join(', ');
  if (who) {
    context(
      `Perfil: ${who}${
        known.experienceYears ? `, ${known.experienceYears} años de experiencia` : ''
      }.`,
    );
  }
  if (known.goal) context(`Busca: ${known.goal}.`);
  if (known.chosenPath) context(`Camino elegido: ${known.chosenPath}.`);
  if (known.weeklyTasks.length > 0) {
    context(`Sus tareas: ${known.weeklyTasks.slice(0, 5).join(', ')}.`);
  }
  if (known.tools.length > 0) context(`Ya usa: ${known.tools.slice(0, 5).join(', ')}.`);
  /*
   * Whether they already work with AI, which the teacher asks for and then
   * forgot.
   *
   * `profile_ai_usage` is extracted on every finished call, written to the
   * database, and mapped into this object — and nothing read the value. Not the
   * record, not the notebook, not the plan. So ElevenLabs ran an extraction per
   * call for a field consumed by nobody, which is the exact waste
   * `agent.test.ts` says it guards against; that check passes because the field
   * name is referenced, not because the answer is used.
   *
   * The cost is not the extraction. The persona's first session asks "qué tiene
   * a mano, un asistente de chat o el correo y las planillas de siempre" — so
   * the learner answers, the answer is captured, and the next session opens
   * without it and asks again. Being asked the same question twice by something
   * that claims to remember you is worse than never being asked.
   */
  if (known.aiUsage) context(`Con IA: ${known.aiUsage}.`);
  /*
   * That the map has already been given.
   *
   * Three extraction fields exist for this, under a comment in `agent.ts` that
   * says so in as many words: "the map, so it is never given twice". They were
   * captured, stored and rendered on the notebook, and the record said nothing —
   * so the teacher opened every later session with no idea it had already done
   * it.
   *
   * The persona commits to the same thing: "seis bloques hablados cortos como
   * máximo, y una sola vez. Después no se repite." Unenforceable without this
   * line. And "cuéntame qué es posible para alguien que hace lo que yo hago" is
   * a one-tap button on /coach, so asking for it again is the easy path — six
   * spoken blocks, out of an allowance that is twenty minutes for a lifetime,
   * spent repeating something already written down on their own page.
   *
   * Phrased as the persona phrases the remedy, so the teacher does the thing it
   * was already told to do rather than being given a second rule.
   */
  if (known.map.value || known.map.categories || known.map.paths) {
    context('Ya le diste el mapa: no lo repitas, retómalo por partes cuando el plan llegue a una categoría.');
  }
  /*
   * The saving goes near the front of the record, because it is the best thing
   * the teacher can open on: a person who hears "ya recuperas tres horas a la
   * semana" is being told what they got, in their own numbers, before being
   * asked for anything.
   */
  if (saved.perWeek > 0) {
    blocks.push({
      text: `Ya recupera ${spellMinutes(saved.perWeek)} por semana, medidos por ella en ${saved.tasksMeasured} tarea(s). Puedes abrir con eso.`,
      keep: KEEP.saving,
    });
  }
  if (current) {
    blocks.push({
      text: `Plan: paso ${current.number} de ${steps.length}, "${toWord(current.step.title, ECHO_TITLE)}".`,
      keep: KEEP.plan,
    });
    /*
     * Half a measurement, which is the most useful thing a record can carry.
     *
     * `minutes_before` is written the moment the learner says how long a task
     * takes them, whether or not the class ever reaches the second number. A
     * class that ends first leaves exactly this behind: the task chosen, the
     * before number said out loud and stored, and nothing to subtract from it.
     *
     * A class ends at a fixed ceiling, so this is not a rare accident. The free
     * tier is two classes, and without this line the second one opens knowing
     * the step but not that its number is half-taken. The teacher restarts the
     * task instead of asking the one question that completes it, and the
     * learner spends their whole free allowance without ever seeing a
     * subtraction, which is the only thing here worth paying for.
     */
    if (current.step.minutesBefore !== null && current.step.minutesAfter === null) {
      blocks.push({
        text:
          `Ya te dijo que esa tarea le toma ${spellMinutes(current.step.minutesBefore)}, y falta ` +
          'el segundo número: termínala y pregúntale cuánto tardó ahora.',
        keep: KEEP.plan,
      });
    }
  } else if (steps.length > 0) {
    /*
     * An instruction, not an observation.
     *
     * This used to say only that the steps were all done, which told the teacher
     * a fact and left it to invent what a session is for afterwards. Levels 2 to
     * 4 are fixed and finite, so every learner who keeps paying arrives here, and
     * arrives with nothing waiting: the opening said "retomemos donde quedamos"
     * about a plan with no next step, and the measured figure the price is
     * argued from had made its last move.
     *
     * The week is what recurs, so level 1 is what resumes. `buildPlan` now lets a
     * finished task make room for the next one, and this is the sentence that
     * makes the teacher go and get it.
     */
    blocks.push({
      text:
        `Plan: los ${steps.length} pasos están hechos. Sigue con otra tarea de su semana, ` +
        'como en el nivel 1: cuál le pesa ahora, cuánto tarda, háganla en la sesión y ' +
        'cierra con cuánto tardó. Aparece sola en su plan.',
      keep: KEEP.plan,
    });
  }
  if (lastCommitment?.commitment) {
    const state =
      lastCommitment.commitmentDone === true
        ? 'marcado como hecho'
        : lastCommitment.commitmentDone === false
          ? 'marcado como no hecho'
          : 'sin confirmar';
    /*
     * Trimmed to the same budget the spoken opening uses on the same sentence.
     *
     * A commitment arrives capped at `FIELD_CHARS`, so a verbose one is over half
     * this record on its own — and it is the line that must never be the one to
     * go, which would make everything else go instead. The record is a summary;
     * 140 characters of it is the promise, and the learner is about to be asked
     * whether they kept it in any case.
     */
    blocks.push({
      text: `Último compromiso: ${toWord(lastCommitment.commitment, ECHO_COMMITMENT)} (${state}).`,
      keep: KEEP.commitment,
    });
  }
  const days = history[0] ? daysSince(history[0].createdAt) : null;
  if (days !== null) {
    blocks.push({
      text:
        days === 0
          ? 'Habló contigo hoy.'
          : `Última sesión: hace ${days} día${days === 1 ? '' : 's'}.`,
      keep: KEEP.days,
    });
  }

  return {
    apertura: opening(known, current, lastCommitment ?? null, saved.perWeek, steps.length),
    registro:
      fitRecord(blocks, RECORD_CHARS) ||
      'Ya hablaron antes, pero no quedó registro de quién es: pregúntaselo de nuevo.',
    primera_sesion: 'no',
  };
}

/**
 * The record, cut down to its budget by dropping whole lines.
 *
 * Sheds the least valuable line first, and among equals the one that reads last,
 * so the profile echo survives the tools list and the map note survives nothing.
 * A line is never cut in half: half of "Último compromiso: mandar el resumen del
 * comité" is worse than not naming it, because the teacher reads it out and asks
 * about something the learner never said.
 *
 * The final slice is the guard for a single line longer than the whole budget,
 * which the per-line trims above should already have prevented.
 */
function fitRecord(lines: readonly RecordLine[], limit: number): string {
  const kept = [...lines];
  const size = () => kept.reduce((n, l) => n + l.text.length + 1, -1);

  while (kept.length > 1 && size() > limit) {
    let worst = 0;
    for (let i = 1; i < kept.length; i++) {
      // `<=`, so ties are broken towards the later line.
      if (kept[i]!.keep <= kept[worst]!.keep) worst = i;
    }
    kept.splice(worst, 1);
  }

  return kept
    .map((l) => l.text)
    .join(' ')
    .slice(0, limit);
}

function daysSince(iso: string): number {
  const then = new Date(iso);
  then.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - then.getTime()) / 86_400_000));
}

/**
 * The spoken opening for a returning learner: who they are, where they are, and
 * what they owe. Kept to two sentences, because it is said before anyone has had
 * a chance to interrupt.
 *
 * ## Why the length handling is this careful
 *
 * Every ingredient here is learner text that arrived through an extraction, so
 * each one can be up to `FIELD_CHARS` long: the role, the step title when the
 * step is one of their own weekly tasks, and above all the commitment. This used
 * to end in a flat `.slice(0, 320)` over the joined string, which meant a long
 * commitment produced an opening that stopped mid-word and dropped `¿Lo hiciste?`
 * off the end. The teacher would greet a returning learner, trail off on half a
 * word, and go quiet having asked nothing. Silence at the start of a voice
 * session reads as the product being broken, and there is no second first
 * impression.
 *
 * So: each echoed piece is trimmed to a whole word inside its own budget, and if
 * the total still runs long the lead is what gives way. The closing question is
 * the only part the learner has to answer, and it always survives.
 *
 * Exported for `progress.test.ts`. Nothing else calls it, and the test seam is
 * worth it because every failure it guards is a first sentence nobody logs.
 */
export function opening(
  profile: CareerProfile,
  current: { step: PlanStep; number: number } | null,
  lastCommitment: SessionRecord | null,
  savedPerWeek = 0,
  /**
   * How many steps the plan has, which is the only thing separating a plan
   * finished from a plan never built. Both arrive here as a null `current`, and
   * they are opposite situations: one has nothing yet and one has everything.
   */
  stepsInPlan = 0,
): string {
  const parts: string[] = [];
  /** Every step done, as against a learner whose plan was never built. */
  const finished = !current && stepsInPlan > 0;

  /*
   * When there is a saving, it opens the session. This is the one sentence in the
   * product that answers "what did I get for my money", and it is said before
   * anything is asked of the learner.
   */
  if (savedPerWeek >= 30) {
    /*
     * Said by `spellMinutes`, not by a second copy of the same arithmetic.
     *
     * There was one here, and it carried the same defect the written version
     * did: `hora` pluralised, `minutos` never, so a saving of sixty-one minutes
     * was spoken as "1 hora y 1 minutos". Worse out loud than on a page, and
     * this is the first sentence a returning learner hears.
     *
     * Two implementations of one sentence is why the fix in round 60 did not
     * reach here. One now.
     */
    parts.push(`Retomemos. Con lo que ya montaste recuperas ${spellMinutes(savedPerWeek)} cada semana.`);
  }

  const who = toWord(profile.role ?? profile.field ?? '', ECHO_WHO);
  const title = current ? toWord(current.step.title, ECHO_TITLE) : '';
  if (parts.length > 0) {
    // The number already opened; go straight to what is owed or where they are.
  } else if (who && current) {
    parts.push(`Retomemos. Eres ${who} y vas en el paso ${current.number}: ${title}.`);
  } else if (current) {
    parts.push(`Retomemos. Vas en el paso ${current.number}: ${title}.`);
  } else if (finished) {
    parts.push(`Terminaste los ${stepsInPlan} pasos de tu plan.`);
  } else {
    parts.push('Retomemos donde quedamos.');
  }

  if (lastCommitment?.commitment && lastCommitment.commitmentDone !== true) {
    const echo = toWord(lowerFirst(lastCommitment.commitment), ECHO_COMMITMENT);
    /*
     * An extraction that is all punctuation leaves nothing to read back, and
     * "Quedaste en ." is worse than not naming it. Ask anyway: the commitment
     * exists, the learner knows what it was, and the answer is what matters.
     */
    parts.push(echo ? `Quedaste en ${echo}. ¿Lo hiciste?` : '¿Hiciste lo que quedaste la vez pasada?');
  } else if (finished) {
    /*
     * The plan is done and nothing is owed, so the only question worth the first
     * turn is the one that starts the next measurement. "¿Estás frente al
     * computador o caminando?" is the right opener for a session with a step
     * waiting; here there is none, and asking it leaves the teacher to work out
     * on its own that the session still has a purpose.
     */
    parts.push('¿Cuál es la tarea de tu semana que más te pesa ahora?');
  } else {
    parts.push('¿Estás frente al computador o caminando?');
  }

  const said = parts.join(' ');
  if (said.length <= OPENING_CHARS) return said || OPENING_RETURN_FALLBACK;

  /*
   * Over budget even after trimming each piece. Shed the lead, not the question:
   * the lead is context the learner already has, the question is the turn.
   */
  const closer = parts[parts.length - 1]!;
  const room = OPENING_CHARS - closer.length - 2;
  const lead = room > 24 ? toWord(parts.slice(0, -1).join(' '), room) : '';
  return lead ? `${lead}. ${closer}` : closer;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

// ------------------------------------------------------------------- writing

/**
 * Everything a finished conversation changes, in one pass.
 *
 * Called from the post-call webhook, and safe to call twice for the same
 * conversation: the profile is an upsert, the plan is only built when there is
 * none, and the session row is keyed on the conversation id so a redelivery
 * updates instead of duplicating.
 */
export async function applyConversation(
  userId: string,
  conversationId: string,
  analysis: CallAnalysis,
): Promise<{ profile: boolean; planCreated: number; stepAdvanced: string | null }> {
  if (!serviceConfigured()) return { profile: false, planCreated: 0, stepAdvanced: null };

  const profileWritten = await upsertProfile(userId, analysis);
  const planCreated = await ensurePlan(userId);
  const stepAdvanced = await advanceStep(userId, analysis);
  await recordSession(userId, conversationId, analysis, stepAdvanced);

  return { profile: profileWritten, planCreated, stepAdvanced };
}

/**
 * Write the profile, without erasing what an earlier session established.
 *
 * A lesson session mentions the learner's role in passing and says nothing about
 * their sector, so the extractor returns empty strings for most fields. Writing
 * those would wipe the diagnostic. Only fields the transcript actually produced
 * are sent.
 */
async function upsertProfile(userId: string, analysis: CallAnalysis): Promise<boolean> {
  const patch: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };

  const set = (column: string, value: unknown) => {
    if (value !== null && value !== undefined) patch[column] = value;
  };

  set('role', field(analysis, 'profile_role'));
  set('field', field(analysis, 'profile_field'));
  set('sector', field(analysis, 'profile_sector'));

  const years = Number(field(analysis, 'profile_experience_years'));
  if (Number.isFinite(years) && years >= 0 && years < 80) set('experience_years', Math.round(years));

  const tasks = list(analysis, 'profile_weekly_tasks');
  if (tasks.length > 0) set('weekly_tasks', tasks);
  const tools = list(analysis, 'profile_tools');
  if (tools.length > 0) set('tools', tools);

  set('ai_usage', field(analysis, 'profile_ai_usage'));
  set('goal', field(analysis, 'profile_goal'));
  set('chosen_path', pathOf(analysis));

  const map = {
    value: field(analysis, 'map_value') ?? undefined,
    categories: field(analysis, 'map_categories') ?? undefined,
    paths: field(analysis, 'map_paths') ?? undefined,
  };
  if (map.value || map.categories || map.paths) {
    // Merged rather than replaced: the map is given once, and a later session
    // that mentions one part of it must not blank the other two.
    const existing = await careerProfile(userId);
    set('map', { ...(existing?.map ?? {}), ...prune(map) });
  }

  // Nothing but the key and the timestamp: this call learned nothing about who
  // the person is, so there is nothing to write.
  if (Object.keys(patch).length <= 2) return false;

  const { error } = await supabaseAdmin()
    .from('career_profiles')
    .upsert(patch, { onConflict: 'user_id' });

  if (error && !pending(error.code)) {
    console.error('[progress] profile write failed:', error.message);
    return false;
  }
  return !error;
}

function prune<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * Build the plan the first time there is enough to build it from.
 *
 * "Enough" is the weekly tasks: without them there is no applied level, and a
 * plan of only fixed lessons is a course rather than this person's plan. So a
 * diagnostic that ran out of minutes before getting to the tasks leaves no plan
 * and the next session finishes the job.
 */
async function ensurePlan(userId: string): Promise<number> {
  const existing = await planSteps(userId);

  const profile = await careerProfile(userId);
  if (!profile || profile.weeklyTasks.length === 0) return 0;

  const planned: PlannedStep[] = buildPlan({
    weeklyTasks: profile.weeklyTasks,
    path: profile.chosenPath,
    /*
     * What the learner already carries, so the cap on open weekly tasks is
     * applied against the plan rather than against one extraction. Without this
     * the list `buildPlan` sees is whatever the last conversation happened to
     * mention, and a sixth task survives or is dropped depending on how many
     * older ones the extractor listed beside it.
     */
    carried: existing
      .filter((s) => isWeeklyTask(s.lessonId))
      .map((s) => ({ lessonId: s.lessonId, done: s.status === 'done' })),
  });

  /*
   * The plan grows as the learner names more of their week.
   *
   * This used to return early whenever any step existed, so the plan was frozen
   * at whatever the first successful extraction held. Somebody who named one
   * task in their first conversation had a one-task plan for good, while the
   * offer next to it promised three to five, and the teacher went on collecting
   * tasks that never appeared anywhere.
   *
   * Safe to re-run now only because `weeklyLessonId` derives the id from the
   * task text: an existing step keeps its id, and with it its status, its
   * evidence and its measured minutes. The upsert names no status column, so a
   * finished step stays finished. Nothing is ever deleted, because deleting a
   * step is deleting a measurement.
   */
  const known = new Set(existing.map((s) => s.lessonId));
  if (planned.every((step) => known.has(step.lessonId))) return 0;

  const rows = planOrder(existing, planned).map((step, i) => ({
    user_id: userId,
    lesson_id: step.lessonId,
    level: step.level,
    title: step.title,
    linked_task: step.linkedTask,
    position: i,
  }));

  const { error } = await supabaseAdmin()
    .from('plan_steps')
    .upsert(rows, { onConflict: 'user_id,lesson_id' });

  if (error) {
    if (!pending(error.code)) console.error('[progress] plan write failed:', error.message);
    return 0;
  }
  return rows.length;
}

/**
 * Every step the learner has, in the order the plan should read.
 *
 * ## Why this is not `planned.map((step, i) => ...)`
 *
 * `position` is what `planSteps` orders by and therefore what decides which step
 * is current, and it was written from the index into `planned` alone. `planned`
 * holds the weekly tasks named by *the last extraction that produced any*, and
 * `upsertProfile` replaces `weekly_tasks` wholesale, so that list shrinks as
 * easily as it grows: a lesson session that mentions one task in passing leaves
 * a profile with one.
 *
 * Nothing was corrupted while the plan only ever gained steps in the same order.
 * The moment one genuinely new lesson id appeared, the whole of `planned` was
 * renumbered from zero — and the weekly steps that had dropped out of the
 * profile were not in `planned`, so they kept the positions they were given when
 * the plan was longer. Two steps on one position, no unique index to refuse it,
 * and an order Postgres is free to pick either way. The visible result is a plan
 * that reshuffles and a "paso 4 de 12" that means a different lesson than it did
 * yesterday, which is the one thing the deterministic plan exists to prevent.
 *
 * So positions are assigned over the union: every step already in the database,
 * plus everything new, sorted into curriculum order. Existing steps keep their
 * relative order inside their level and new ones land after them, which is also
 * the honest place for a task taken on in month three.
 *
 * The planned copy wins on title and linked task where both have the lesson, so
 * a lesson renamed in `curriculum.ts` still reaches the rows; the stored copy is
 * used only for steps `buildPlan` no longer emits.
 *
 * Exported for `progress.test.ts`. Nothing else calls it, and the seam is worth
 * it because the failure it guards is silent: two rows on one position produce a
 * plan in the wrong order, never an error.
 */
export function planOrder(
  existing: readonly PlanStep[],
  planned: readonly PlannedStep[],
): PlannedStep[] {
  const byId = new Map(planned.map((step) => [step.lessonId, step]));
  const seen = new Set<string>();
  const merged: PlannedStep[] = [];

  // `existing` arrives ordered by position, so this preserves the plan as read.
  for (const step of existing) {
    seen.add(step.lessonId);
    merged.push(
      byId.get(step.lessonId) ?? {
        lessonId: step.lessonId,
        level: step.level,
        title: step.title,
        linkedTask: step.linkedTask,
      },
    );
  }
  for (const step of planned) {
    if (!seen.has(step.lessonId)) merged.push(step);
  }

  // Stable, so the order established above survives inside each level.
  const rank = (level: LevelId) => LEVELS.findIndex((l) => l.id === level);
  return merged.sort((a, b) => rank(a.level) - rank(b.level));
}

/**
 * Mark the step that was taught, and store what the learner showed for it.
 *
 * The extractor returns the step's title as the teacher said it, not its id, so
 * the match is by title against this learner's own steps and falls back to the
 * current step. A wrong match would advance the plan past a lesson nobody had,
 * so an unmatched title with no current step advances nothing.
 */
async function advanceStep(userId: string, analysis: CallAnalysis): Promise<string | null> {
  const steps = await planSteps(userId);
  if (steps.length === 0) return null;

  const taught = field(analysis, 'lesson_taught');
  const evidence = field(analysis, 'evidence');
  const statusRaw = field(analysis, 'lesson_status')?.toLowerCase();
  const commitment = field(analysis, 'commitment');
  const due = field(analysis, 'commitment_due');

  const minutesBefore = minutes(analysis, 'task_minutes_before');
  const minutesAfter = minutes(analysis, 'task_minutes_after');

  const target = taught ? matchStep(steps, taught) : null;
  const step = target ?? currentStep(steps)?.step ?? null;
  if (!step) return null;
  // Nothing happened to a step this session: no lesson named, nothing shown,
  // no status. Advancing on a commitment alone would mark lessons done for
  // somebody who only ever promised.
  if (!taught && !evidence && !statusRaw && minutesAfter === null) return null;

  const status = readStatus(statusRaw) ?? step.status;

  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (evidence) patch.evidence = evidence;

  /*
   * The numbers only attach to a weekly task. Writing them onto a fundamentals
   * step would put minutes on a lesson that saves none, and the weekly sum would
   * start counting things that are not part of anyone's week.
   */
  if (isWeeklyTask(step.lessonId)) {
    if (minutesBefore !== null) patch.minutes_before = minutesBefore;
    if (minutesAfter !== null) patch.minutes_after = minutesAfter;
  }
  if (commitment) {
    patch.commitment = commitment;
    // The spoken deadline is usually a phrase, not a date. It is kept verbatim on
    // `coach_sessions.commitment_due` by the commitments feature; only an actual
    // ISO date makes it into this column.
    patch.commitment_date = isoDate(due);
  }

  // `count` too: a filter that matches nothing is not an error, and this is the
  // write that records what was taught and the two minute figures. Losing it
  // silently loses the measurement the whole offer is built on.
  const { error, count } = await supabaseAdmin()
    .from('plan_steps')
    .update(patch, { count: 'exact' })
    .eq('id', step.id);
  if (error && !pending(error.code)) {
    console.error('[progress] step write failed:', error.message);
  } else if (!error && count === 0) {
    console.error(`[progress] step ${step.id} vanished between read and write: nothing recorded`);
  }
  return step.lessonId;
}

/**
 * How the step ended, from a word an extractor produced.
 *
 * ## Why this is not a pair of equality checks
 *
 * It was, and the comparison was against `'hecho'` exactly. The extraction
 * prompt does say "en una de estas dos palabras exactas", and models mostly
 * obey it, and the one thing they add to a one-word answer more than anything
 * else is a full stop. `"Hecho."` lowercases to `"hecho."`, misses, and the step
 * silently stays pending.
 *
 * That is the most expensive miss in the product. `advanceStep` still writes the
 * minutes, `timeSaved` only counts steps that are `done`, so the learner's own
 * measurement sits in the database and is never counted: the progress page stays
 * empty, the recovered-hours line never appears, and the offer that depends on it
 * is never made. Somebody who did the work, got the result, and reported it is
 * never asked to pay, and nothing anywhere logs a problem.
 *
 * So: generous about formatting, strict about meaning. Punctuation, case,
 * accents and underscore-versus-space are noise and are normalised away. The
 * vocabulary is a short closed list, because the failure of being too generous
 * runs the other way: marking a step done that is not inflates the saved-minutes
 * total, which is the one number that has to be defensible line by line.
 *
 * Anything unrecognised returns null, and the caller leaves the status alone.
 * Guessing from an unknown word is how a product starts congratulating people
 * for work they have not finished.
 */
const DONE_WORDS = new Set([
  'hecho', 'hecha', 'hechos', 'hechas',
  'listo', 'lista', 'completado', 'completada', 'completo', 'completa',
  'terminado', 'terminada', 'finalizado', 'finalizada', 'resuelto', 'resuelta',
  'done',
]);

const PROGRESS_WORDS = new Set([
  'en progreso', 'progreso', 'en curso', 'parcial', 'a medias', 'incompleto',
  'incompleta', 'empezado', 'empezada', 'iniciado', 'iniciada', 'avanzando',
  'in progress',
]);

export function readStatus(raw: string | null | undefined): PlanStep['status'] | null {
  if (!raw) return null;
  const word = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!word) return null;
  if (DONE_WORDS.has(word)) return 'done';
  if (PROGRESS_WORDS.has(word)) return 'in_progress';
  return null;
}

/**
 * Which step the teacher just taught, from the title as it was said.
 *
 * Loose on purpose: the teacher paraphrases, so exact equality would almost never
 * hit. But a wrong match is worse than no match, because `advanceStep` writes the
 * minutes onto whatever comes back — so a mismatch marks the wrong task done and
 * attributes the saving to work the learner never did, silently corrupting the one
 * number the whole value claim rests on. When in doubt this returns null and the
 * caller falls back to the step the learner is actually on.
 *
 * Two rules earn their place:
 *
 * **A needle has to be substantial.** `''.includes('')` is true, so an extraction
 * that normalises to nothing (`"..."`, `"?"`, a stray number) used to match the
 * *first* step in the plan unconditionally and write minutes to it.
 *
 * **Ambiguity is not a match.** Several step titles share words — "Por qué el
 * contexto cambió la respuesta" and "Pedir bien: instrucción, contexto, formato"
 * both contain "contexto" — and picking whichever sorted first was a coin flip
 * dressed up as a decision.
 *
 * Exported for `progress.test.ts`: it encodes real product judgement, and the
 * failure it guards is invisible in production.
 */
export function matchStep(steps: readonly PlanStep[], taught: string): PlanStep | null {
  const needle = normalise(taught);

  // Shorter than this and a substring match says nothing: "de", "el", "1".
  if (needle.length < 4) return null;

  const exact = steps.filter((s) => normalise(s.title) === needle);
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return null;

  const contained = steps.filter((s) => {
    const title = normalise(s.title);
    return title.length >= 4 && (needle.includes(title) || title.includes(needle));
  });
  if (contained.length === 1) return contained[0]!;
  if (contained.length > 1) return null;

  /*
   * Last resort: the lesson id, in case the teacher read it out.
   *
   * Normalised on both sides. It compared the raw id against a normalised needle
   * before, and `normalise` turns the hyphen in `cri-02` into a space, so this
   * branch could never match anything.
   */
  const byLesson = steps.filter(
    (s) => lessonById(s.lessonId) && needle.includes(normalise(s.lessonId)),
  );
  return byLesson.length === 1 ? byLesson[0]! : null;
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * One row per finished session.
 *
 * Keyed on the conversation id so a webhook redelivery updates rather than
 * duplicating. `commitment_done` is left null: nobody has answered yet, and
 * that is different from answering no.
 */
async function recordSession(
  userId: string,
  conversationId: string,
  analysis: CallAnalysis,
  lessonId: string | null,
): Promise<void> {
  const taught =
    field(analysis, 'lesson_taught') ?? analysis?.call_summary_title?.trim() ?? null;

  const { error } = await supabaseAdmin().from('session_summaries').upsert(
    {
      user_id: userId,
      conversation_id: conversationId,
      lesson_id: lessonId,
      taught,
      commitment: field(analysis, 'commitment'),
      commitment_date: isoDate(field(analysis, 'commitment_due')),
    },
    { onConflict: 'conversation_id' },
  );

  if (error && !pending(error.code)) {
    console.error('[progress] session row failed:', error.message);
  }
}
