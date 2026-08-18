/**
 * What the classes themselves say, read from ElevenLabs rather than from us.
 *
 * The funnel on `/admin/embudo` counts rows this app wrote, and this app writes
 * nothing until the post-call webhook is registered. That is the state every
 * deployment starts in, and it is exactly when somebody most wants to know
 * whether a class works: the page answers zero to every question while real
 * conversations are happening, and zero is indistinguishable from broken.
 *
 * ElevenLabs already holds the answer. Each conversation carries the extractor's
 * results and, since the criteria were configured, a verdict per part of what
 * this product promises. Reading it here means the funnel has something true to
 * say on day one, from a source that owes nothing to our own plumbing being
 * finished.
 *
 * Deliberately not a substitute for the funnel. It sees conversations, not
 * people: it cannot say who came back, who is paying, or who stopped. It answers
 * the narrower question of whether the classes that happened did what a class is
 * supposed to do.
 */
import { agentId } from './config';
import { withDeadline } from './deadline';

export interface ClassReport {
  /** Conversations over a minute. Shorter ones are a button press, not a class. */
  held: number;
  /** How many of the sampled ones carry an analysis at all. */
  analysed: number;
  /**
   * How many were even asked for the two minute figures.
   *
   * The extraction fields arrived over several syncs, so an older conversation
   * can carry three fields, or none. Counting those as "did not measure" reports
   * a failure where the truth is that nobody asked, which is the distinction
   * this file exists to respect and the one it got wrong first time.
   */
  measurable: number;
  /** Of the measurable ones, how many ended with both figures. */
  measured: number;
  /** How many were graded at all. Zero until the success criteria were pushed. */
  graded: number;
  /**
   * Of the graded ones, how many passed each criterion.
   *
   * All four rather than the one, because they fail for different reasons and
   * ask for different fixes: a class that finished no task is a session shape
   * problem, one that produced no numbers is usually a unit or a clock problem,
   * a missing commitment is the closing being skipped, and a failed honesty
   * check is the persona. Reporting only the first would send somebody
   * rewriting the session order for a fault in the last minute of it.
   */
  passed: Record<string, number>;
  /** Kept for the one the funnel leads with. */
  finished: number;
  /** The extractor's own words on the most recent class that missed a number. */
  whyNot: string | null;
  /**
   * True when the newest class predates the agent's last update.
   *
   * Named for what it reads, not for what it implies. `updated_at_unix_secs`
   * moves whenever anything on the agent is written — a document re-synced, a
   * criterion added, a placeholder changed — and the persona is only one of
   * those. Reporting it as "the teacher changed" overstates, because most syncs
   * do not change a word anybody hears.
   */
  agentChangedSince: boolean;
}

/** One request per conversation, so this reads the recent ones and stops. */
const SAMPLE = 5;
const DEADLINE_MS = 6_000;

async function read(): Promise<ClassReport | null> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  const id = agentId();
  if (!key || !id) return null;

  const headers = { 'xi-api-key': key };
  const [agentRes, listRes] = await Promise.all([
    fetch(`https://api.elevenlabs.io/v1/convai/agents/${id}`, { headers }),
    fetch(`https://api.elevenlabs.io/v1/convai/conversations?agent_id=${id}&page_size=30`, {
      headers,
    }),
  ]);
  if (!listRes.ok) return null;

  const agent = (await agentRes.json().catch(() => ({}))) as {
    metadata?: { updated_at_unix_secs?: number };
  };
  const list = (await listRes.json()) as {
    conversations?: Array<{
      conversation_id?: string;
      call_duration_secs?: number;
      start_time_unix_secs?: number;
    }>;
  };

  const real = (list.conversations ?? []).filter((c) => (c.call_duration_secs ?? 0) >= 60);
  const changed = (agent.metadata?.updated_at_unix_secs ?? 0) * 1000;
  const newest = Math.max(0, ...real.map((c) => (c.start_time_unix_secs ?? 0) * 1000));

  const analyses: Analysis[] = [];
  for (const c of real.slice(0, SAMPLE)) {
    if (!c.conversation_id) continue;
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${c.conversation_id}`,
      { headers },
    );
    if (!res.ok) continue;
    const body = (await res.json()) as { analysis?: Analysis };
    if (body.analysis) analyses.push(body.analysis);
  }

  return {
    ...summarise(analyses),
    held: real.length,
    agentChangedSince: newest > 0 && newest < changed,
  };
}

/** The shape this reads out of a conversation, and nothing more of it. */
export interface Analysis {
  data_collection_results?: Record<string, { value?: unknown; rationale?: string }>;
  evaluation_criteria_results?: Record<string, { result?: string }>;
}

/**
 * The counting, separated from the fetching so it can be tested.
 *
 * It was not, and it was wrong twice in two days, both times in the same
 * direction: reporting a failure where nobody had asked the question. The
 * extraction fields arrived over several syncs and the success criteria arrived
 * after every conversation on the agent, so "this class produced no numbers" and
 * "this class was never asked for numbers" are both common and mean opposite
 * things to somebody deciding whether the product works.
 */
export function summarise(analyses: readonly Analysis[]): Omit<
  ClassReport,
  'held' | 'agentChangedSince'
> {
  let analysed = 0;
  let measurable = 0;
  let measured = 0;
  let graded = 0;
  let finished = 0;
  const passed: Record<string, number> = {};
  let whyNot: string | null = null;

  for (const analysis of analyses) {
    const fields = analysis.data_collection_results;
    if (!fields || Object.keys(fields).length === 0) continue;
    analysed++;

    const filled = (name: string) => {
      const v = fields[name]?.value;
      return v !== null && v !== undefined && v !== '';
    };

    // Asked is not the same as answered. A conversation from before these fields
    // existed carries no key for them, and reading that as an empty answer would
    // blame the class for a question nobody put to it.
    if ('task_minutes_before' in fields && 'task_minutes_after' in fields) {
      measurable++;
      if (filled('task_minutes_before') && filled('task_minutes_after')) measured++;
      else if (!whyNot) {
        const why = fields.task_minutes_before?.rationale ?? fields.task_minutes_after?.rationale;
        whyNot = why ? why.replace(/\s+/g, ' ').slice(0, 220) : null;
      }
    }

    // Same rule for the verdict: the criteria are newer than every conversation
    // on this agent, so an ungraded one is unmarked, not failed.
    const verdicts = analysis.evaluation_criteria_results;
    if (verdicts && Object.keys(verdicts).length > 0) {
      graded++;
      for (const [name, verdict] of Object.entries(verdicts)) {
        if (verdict?.result === 'success') passed[name] = (passed[name] ?? 0) + 1;
      }
      if (verdicts.tarea_terminada?.result === 'success') finished++;
    }
  }

  return { analysed, measurable, measured, graded, finished, passed, whyNot };
}


/**
 * Never throws and never hangs the page.
 *
 * This is a panel on a dashboard, sitting beside numbers that come from our own
 * database. ElevenLabs being slow or down is not a reason for an operator to
 * lose the funnel, so the deadline returns null and the page renders without it.
 */
export function classReport(): Promise<ClassReport | null> {
  return withDeadline(
    read().catch((err) => {
      console.error('[classes] could not read conversations:', err);
      return null;
    }),
    null,
    DEADLINE_MS,
  );
}
