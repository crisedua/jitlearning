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
  /** Of those, how many ended with both minute figures. */
  measured: number;
  /** Of those, how many finished a real task, per the success criteria. */
  finished: number;
  /** The extractor's own words on the most recent class that missed a number. */
  whyNot: string | null;
  /** True when the newest class predates the persona now on the agent. */
  personaChangedSince: boolean;
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

  let analysed = 0;
  let measured = 0;
  let finished = 0;
  let whyNot: string | null = null;

  for (const c of real.slice(0, SAMPLE)) {
    if (!c.conversation_id) continue;
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${c.conversation_id}`,
      { headers },
    );
    if (!res.ok) continue;
    const body = (await res.json()) as {
      analysis?: {
        data_collection_results?: Record<string, { value?: unknown; rationale?: string }>;
        evaluation_criteria_results?: Record<string, { result?: string }>;
      };
    };
    const fields = body.analysis?.data_collection_results;
    if (!fields || Object.keys(fields).length === 0) continue;
    analysed++;

    const filled = (name: string) => {
      const v = fields[name]?.value;
      return v !== null && v !== undefined && v !== '';
    };
    if (filled('task_minutes_before') && filled('task_minutes_after')) measured++;
    else if (!whyNot) {
      const why = fields.task_minutes_before?.rationale ?? fields.task_minutes_after?.rationale;
      whyNot = why ? why.replace(/\s+/g, ' ').slice(0, 220) : null;
    }

    if (body.analysis?.evaluation_criteria_results?.tarea_terminada?.result === 'success') {
      finished++;
    }
  }

  return {
    held: real.length,
    analysed,
    measured,
    finished,
    whyNot,
    personaChangedSince: newest > 0 && newest < changed,
  };
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
