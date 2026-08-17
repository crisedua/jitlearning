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
  lessonById,
  type LevelId,
  type PathId,
  type PlannedStep,
} from './curriculum';
import { OPENING_FIRST, OPENING_RETURN_FALLBACK } from './teacher';
import { serviceConfigured, supabaseAdmin } from './supabase/admin';

/** Postgres: undefined table, undefined column. Both mean "migration pending". */
const MISSING_TABLE = '42P01';
const MISSING_COLUMN = '42703';

function pending(code: string | undefined): boolean {
  return code === MISSING_TABLE || code === MISSING_COLUMN;
}

/** The whole injected record. See the note above on why this is capped. */
const RECORD_CHARS = 800;

/** Per-field cap, so a runaway extraction stays a sentence. */
const FIELD_CHARS = 400;

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
  const raw = field(analysis, name);
  if (!raw) return null;
  const value = Number(raw.replace(/[^0-9]/g, ''));
  if (!Number.isFinite(value) || value < 0 || value > 2_400) return null;
  return Math.round(value);
}

/** An ISO date, or null. The spoken deadline ("antes del viernes") is not one. */
function isoDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function pathOf(analysis: CallAnalysis): PathId | null {
  const raw = field(analysis, 'chosen_path')?.toLowerCase();
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

  const { data, error } = await supabaseAdmin()
    .from('plan_steps')
    .select(
      'id, lesson_id, level, title, linked_task, status, evidence, commitment, commitment_date, position, minutes_before, minutes_after',
    )
    .eq('user_id', userId)
    .order('position', { ascending: true });

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
  const [profile, steps, history] = await Promise.all([
    careerProfile(userId),
    planSteps(userId),
    sessionHistory(userId, 3),
  ]);

  if (!profile) {
    return {
      apertura: OPENING_FIRST,
      registro: 'Sin registro previo: es la primera vez que hablas con esta persona.',
      primera_sesion: 'sí',
    };
  }

  const current = currentStep(steps);
  const lastCommitment = history.find((h) => h.commitment);
  const saved = timeSaved(steps);

  const blocks: string[] = [];

  const who = [profile.role, profile.field, profile.sector].filter(Boolean).join(', ');
  if (who) {
    blocks.push(
      `Perfil: ${who}${
        profile.experienceYears ? `, ${profile.experienceYears} años de experiencia` : ''
      }.`,
    );
  }
  if (profile.goal) blocks.push(`Busca: ${profile.goal}.`);
  if (profile.chosenPath) blocks.push(`Camino elegido: ${profile.chosenPath}.`);
  if (profile.weeklyTasks.length > 0) {
    blocks.push(`Sus tareas: ${profile.weeklyTasks.slice(0, 5).join(', ')}.`);
  }
  if (profile.tools.length > 0) blocks.push(`Ya usa: ${profile.tools.slice(0, 5).join(', ')}.`);
  /*
   * The saving goes near the front of the record, because it is the best thing
   * the teacher can open on: a person who hears "ya recuperas tres horas a la
   * semana" is being told what they got, in their own numbers, before being
   * asked for anything.
   */
  if (saved.perWeek > 0) {
    blocks.push(
      `Ya recupera ${saved.perWeek} minutos por semana, medidos por ella en ${saved.tasksMeasured} tarea(s). Puedes abrir con eso.`,
    );
  }
  if (current) {
    blocks.push(`Plan: paso ${current.number} de ${steps.length}, "${current.step.title}".`);
  } else if (steps.length > 0) {
    blocks.push(`Plan: los ${steps.length} pasos están marcados como hechos.`);
  }
  if (lastCommitment?.commitment) {
    const state =
      lastCommitment.commitmentDone === true
        ? 'marcado como hecho'
        : lastCommitment.commitmentDone === false
          ? 'marcado como no hecho'
          : 'sin confirmar';
    blocks.push(`Último compromiso: ${lastCommitment.commitment} (${state}).`);
  }
  const days = history[0] ? daysSince(history[0].createdAt) : null;
  if (days !== null) {
    blocks.push(days === 0 ? 'Habló contigo hoy.' : `Última sesión: hace ${days} días.`);
  }

  return {
    apertura: opening(profile, current, lastCommitment ?? null, saved.perWeek),
    registro: (blocks.join(' ') || 'Tiene perfil pero todavía no hay plan.').slice(0, RECORD_CHARS),
    primera_sesion: 'no',
  };
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
 */
function opening(
  profile: CareerProfile,
  current: { step: PlanStep; number: number } | null,
  lastCommitment: SessionRecord | null,
  savedPerWeek = 0,
): string {
  const parts: string[] = [];

  /*
   * When there is a saving, it opens the session. This is the one sentence in the
   * product that answers "what did I get for my money", and it is said before
   * anything is asked of the learner.
   */
  if (savedPerWeek >= 30) {
    const hours = Math.floor(savedPerWeek / 60);
    const rest = savedPerWeek % 60;
    const said = hours > 0 ? `${hours} hora${hours > 1 ? 's' : ''}${rest ? ` y ${rest} minutos` : ''}` : `${rest} minutos`;
    parts.push(`Retomemos. Con lo que ya montaste recuperas ${said} cada semana.`);
  }

  const who = profile.role ?? profile.field;
  if (parts.length > 0) {
    // The number already opened; go straight to what is owed or where they are.
  } else if (who && current) {
    parts.push(`Retomemos. Eres ${who} y vas en el paso ${current.number}: ${current.step.title}.`);
  } else if (current) {
    parts.push(`Retomemos. Vas en el paso ${current.number}: ${current.step.title}.`);
  } else {
    parts.push('Retomemos donde quedamos.');
  }

  if (lastCommitment?.commitment && lastCommitment.commitmentDone !== true) {
    parts.push(`Quedaste en ${lowerFirst(lastCommitment.commitment)}. ¿Lo hiciste?`);
  } else {
    parts.push('¿Estás frente al computador o caminando?');
  }

  return parts.join(' ').slice(0, 320) || OPENING_RETURN_FALLBACK;
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
  if (existing.length > 0) return 0;

  const profile = await careerProfile(userId);
  if (!profile || profile.weeklyTasks.length === 0) return 0;

  const planned: PlannedStep[] = buildPlan({
    weeklyTasks: profile.weeklyTasks,
    path: profile.chosenPath,
  });

  const rows = planned.map((step, i) => ({
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

  const status =
    statusRaw === 'hecho' ? 'done' : statusRaw === 'en_progreso' ? 'in_progress' : step.status;

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

  const { error } = await supabaseAdmin().from('plan_steps').update(patch).eq('id', step.id);
  if (error && !pending(error.code)) {
    console.error('[progress] step write failed:', error.message);
  }
  return step.lessonId;
}

/** Loose title match: the teacher paraphrases, so exact equality would never hit. */
function matchStep(steps: readonly PlanStep[], taught: string): PlanStep | null {
  const needle = normalise(taught);
  const exact = steps.find((s) => normalise(s.title) === needle);
  if (exact) return exact;

  const contained = steps.find(
    (s) => needle.includes(normalise(s.title)) || normalise(s.title).includes(needle),
  );
  if (contained) return contained;

  // Last resort: the lesson id itself, in case the teacher read it out.
  const byLesson = steps.find((s) => lessonById(s.lessonId) && needle.includes(s.lessonId));
  return byLesson ?? null;
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
