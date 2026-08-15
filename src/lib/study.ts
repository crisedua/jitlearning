/**
 * Study memory: what the coach knows before the learner says a word.
 *
 * Two halves. After a call, `storeSessionSummary` turns the fields ElevenLabs
 * extracted from the transcript into a `session_summaries` row. On connect,
 * `studyContext` reads recent rows plus the career profile and returns a
 * compact block for the agent's dynamic variables.
 *
 * ## Why the block has a hard character budget
 *
 * It is prepended to every turn's context, so it is paid for on every turn, in
 * latency and in tokens. Past a certain size it also stops being read: a model
 * given three paragraphs of history and one question answers the question. 800
 * characters is enough for "you missed 2 of 3 on stakeholders and owe me a
 * chapter review", which is all the opening line needs.
 *
 * ## Everything here fails soft
 *
 * A deployment that has not run the `study_memory` migration still works, cold:
 * a study partner with no memory is worse, not broken. So a missing table
 * (42P01) or column (42703) degrades to a first session rather than to an
 * error the learner sees.
 */
import type { ConversationDetail } from './elevenlabs';
import type { CoachId } from './coaches';
import { serviceConfigured, supabaseAdmin } from './supabase/admin';

/** Postgres: undefined table, undefined column. Both mean "migration pending". */
const MISSING_TABLE = '42P01';
const MISSING_COLUMN = '42703';

function pending(code: string | undefined): boolean {
  return code === MISSING_TABLE || code === MISSING_COLUMN;
}

/** The whole injected block. See the note above on why this is capped. */
const CONTEXT_CHARS = 800;

/** One extracted field, trimmed, or null when the extractor found nothing. */
function field(conversation: ConversationDetail, name: string): string | null {
  const results = conversation.analysis?.data_collection_results;
  const raw = results?.[name]?.value;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Semicolon-separated extraction into an array, since the extractor emits text. */
function list(conversation: ConversationDetail, name: string): string[] {
  return (field(conversation, name) ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
}

/** An ISO date the extractor produced, or null if it is not one. */
function isoDate(conversation: ConversationDetail, name: string): string | null {
  const raw = field(conversation, name);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

/**
 * Write one row per finished call.
 *
 * Called from the same lazy backfill that caches summaries, so there is still
 * no cron and no webhook to secure. A call the learner abandoned in ten seconds
 * produces a row with empty fields, which is honest: it happened.
 */
export async function storeSessionSummary(
  userId: string,
  coach: CoachId,
  conversation: ConversationDetail,
): Promise<void> {
  if (!serviceConfigured()) return;

  const { error } = await supabaseAdmin().from('session_summaries').insert({
    user_id: userId,
    coach,
    exam_or_target_date: isoDate(conversation, 'target_date'),
    weak_areas: list(conversation, 'weak_areas'),
    questions_asked: list(conversation, 'questions_asked'),
    questions_missed: list(conversation, 'questions_missed'),
    commitment: field(conversation, 'commitment'),
    commitment_date: null,
  });

  if (error && !pending(error.code)) {
    console.error('[study] could not store session summary:', error.message);
  }
}

interface SummaryRow {
  created_at: string;
  exam_or_target_date: string | null;
  weak_areas: string[] | null;
  questions_missed: string[] | null;
  commitment: string | null;
  commitment_done: boolean | null;
}

interface ProfileRow {
  role: string | null;
  field: string | null;
  goal: string | null;
  weekly_tasks: string[] | null;
  learning_plan: Array<{ objective?: string; status?: string }> | null;
}

/** Whole days from today to an ISO date. Negative once the date has passed. */
function daysUntil(iso: string): number {
  const target = new Date(`${iso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/**
 * The context injected on connect, or null for a learner with no history.
 *
 * Data only. How to *behave* with it — ask about the commitment early, do not
 * recite the summary — lives in the persona next to every other behaviour rule.
 * The caller marks a null result as `first_session=true` so the persona knows
 * to run the diagnostic rather than open cold.
 */
export async function studyContext(
  userId: string,
  coach: CoachId,
): Promise<string | null> {
  if (!serviceConfigured()) return null;

  const blocks: string[] = [];

  const { data, error } = await supabaseAdmin()
    .from('session_summaries')
    .select('created_at, exam_or_target_date, weak_areas, questions_missed, commitment, commitment_done')
    .eq('user_id', userId)
    .eq('coach', coach)
    .order('created_at', { ascending: false })
    .limit(3);

  if (error && !pending(error.code)) {
    console.error('[study] could not read session summaries:', error.message);
  }

  const rows = (data ?? []) as SummaryRow[];

  // The countdown, from the most recent session that recorded a date.
  const dated = rows.find((r) => r.exam_or_target_date);
  if (dated?.exam_or_target_date) {
    const days = daysUntil(dated.exam_or_target_date);
    blocks.push(
      days >= 0
        ? `Fecha objetivo: ${dated.exam_or_target_date}, faltan ${days} días.`
        : `Fecha objetivo declarada (${dated.exam_or_target_date}) ya pasó. Pregunta si la movió.`,
    );
  }

  const weak = [...new Set(rows.flatMap((r) => r.weak_areas ?? []))].slice(0, 5);
  if (weak.length > 0) blocks.push(`Áreas más débiles: ${weak.join(', ')}.`);

  const missed = [...new Set(rows.flatMap((r) => r.questions_missed ?? []))].slice(0, 5);
  if (missed.length > 0) blocks.push(`Falló preguntas de: ${missed.join(', ')}.`);

  const lastCommitment = rows.find((r) => r.commitment);
  if (lastCommitment?.commitment) {
    blocks.push(
      `Último compromiso: ${lastCommitment.commitment}${
        lastCommitment.commitment_done ? ' (marcado como hecho)' : ' (sin confirmar)'
      }. Pregunta pronto si lo hizo.`,
    );
  }

  if (coach === 'empleabilidad') {
    const profile = await careerProfile(userId);
    if (profile) {
      const who = [profile.role, profile.field].filter(Boolean).join(', ');
      if (who) blocks.push(`Perfil: ${who}. Objetivo: ${profile.goal ?? 'sin declarar'}.`);

      const plan = profile.learning_plan ?? [];
      const current = plan.findIndex((s) => s.status !== 'done');
      if (plan.length > 0 && current >= 0) {
        blocks.push(
          `Plan: paso ${current + 1} de ${plan.length}, "${plan[current]?.objective ?? 'sin objetivo'}".`,
        );
      }
      const tasks = profile.weekly_tasks ?? [];
      if (tasks.length > 0) blocks.push(`Tareas de su semana: ${tasks.slice(0, 4).join(', ')}.`);
    }
  }

  if (blocks.length === 0) return null;
  return blocks.join(' ').slice(0, CONTEXT_CHARS);
}

/** The learner's career profile, or null when absent or the migration is pending. */
export async function careerProfile(userId: string): Promise<ProfileRow | null> {
  if (!serviceConfigured()) return null;

  const { data, error } = await supabaseAdmin()
    .from('career_profiles')
    .select('role, field, goal, weekly_tasks, learning_plan')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (!pending(error.code)) {
      console.error('[study] could not read career profile:', error.message);
    }
    return null;
  }
  return (data as ProfileRow) ?? null;
}

/**
 * Whether this is the learner's first session with this coach.
 *
 * Drives `first_session` in the dynamic variables, which is what tells the
 * employability persona to run the diagnostic instead of opening with a plan
 * that does not exist yet.
 */
export async function isFirstSession(userId: string, coach: CoachId): Promise<boolean> {
  if (coach === 'empleabilidad') return (await careerProfile(userId)) === null;
  return (await studyContext(userId, coach)) === null;
}
