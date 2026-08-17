/**
 * Assembles the document catalog on each request from two sources:
 *
 *   - ElevenLabs knowledge base  -> which documents exist, their names and types
 *   - the agent's config         -> which are attached, and in which usage mode
 *
 * Nothing is cached or persisted locally, so any number of Vercel instances
 * see identical state.
 */
import { getAgent, getRagIndexes, listDocuments } from './elevenlabs';
import { agentId, embeddingModel, mapWithConcurrency } from './config';
import { ownsDocument } from './teacher';
import { FAILURE_REASONS } from './knowledge';
import type { DocumentView, KnowledgeDocument, RagIndexStatus, UsageMode } from './types';

/** How many status lookups to run at once. Tuned to stay well inside a 10s function. */
const STATUS_CONCURRENCY = 8;

/**
 * The agent config doubles as the store for usage mode — it's the only place
 * that information lives now.
 */
export async function attachedUsageModes(): Promise<Map<string, UsageMode>> {
  const modes = new Map<string, UsageMode>();

  const id = agentId();
  if (!id) return modes;

  try {
    const agent = await getAgent(id);
    const entries = agent.conversation_config?.agent?.prompt?.knowledge_base ?? [];
    for (const e of entries) modes.set(e.id, e.usage_mode ?? 'auto');
  } catch {
    // A missing or unreachable agent shouldn't blank the document list.
  }

  return modes;
}

async function statusFor(doc: KnowledgeDocument): Promise<{
  status: RagIndexStatus;
  progress: number;
}> {
  try {
    const model = embeddingModel();
    const overview = await getRagIndexes(doc.id);
    const index = overview.indexes?.find((i) => i.model === model);
    return index
      ? { status: index.status, progress: index.progress_percentage ?? 0 }
      : { status: 'new', progress: 0 };
  } catch {
    return { status: 'new', progress: 0 };
  }
}

/** Full catalog: every document plus its index state and attachment. */
export async function listDocumentViews(): Promise<DocumentView[]> {
  const [{ documents }, usageModes] = await Promise.all([
    listDocuments({ pageSize: 100 }),
    attachedUsageModes(),
  ]);

  const views = await mapWithConcurrency(documents, STATUS_CONCURRENCY, async (doc) => {
    const usageMode = usageModes.get(doc.id);

    // Pinned documents bypass RAG entirely, so their index state is irrelevant
    // and querying for it would just be noise.
    if (usageMode === 'prompt') {
      return {
        id: doc.id,
        name: doc.name,
        type: doc.type,
        indexStatus: 'succeeded' as RagIndexStatus,
        indexProgress: 100,
        usageMode,
        attached: true,
        ready: true,
      } satisfies DocumentView;
    }

    const { status, progress } = await statusFor(doc);
    return {
      id: doc.id,
      name: doc.name,
      type: doc.type,
      indexStatus: status,
      indexProgress: progress,
      indexError: FAILURE_REASONS[status],
      usageMode,
      attached: usageModes.has(doc.id),
      ready: status === 'succeeded',
    } satisfies DocumentView;
  });

  return views;
}

/**
 * The documents the agent should carry: everything usable that belongs to the
 * live corpus, keeping whatever usage mode it already had.
 *
 * This filter is what keeps the retired corpora out, and it is physical rather
 * than advisory: a document missing from this list cannot be retrieved at all,
 * whatever the prompt says.
 *
 * Names are matched by prefix (`empleabilidad/`, or one exact file), so this
 * depends on documents being ingested under `<carpeta>/<archivo>`. A document
 * ingested without its folder prefix matches nothing and is attached to
 * nobody — the failure to look for if the teacher never cites its material.
 *
 * `overrides` lets a fresh upload declare its mode before it appears in the
 * agent config.
 */
export async function attachableEntries(
  overrides: ReadonlyMap<string, UsageMode> = new Map(),
): Promise<Array<{ type: DocumentView['type']; name: string; id: string; usage_mode: UsageMode }>> {
  const views = await listDocumentViews();

  return views
    .filter((v) => ownsDocument(v.name))
    .map((v) => ({ ...v, usageMode: overrides.get(v.id) ?? v.usageMode ?? 'auto' }))
    // Pinned docs need no index; retrieved docs must have finished indexing,
    // otherwise the agent references a document it cannot actually search.
    .filter((v) => v.usageMode === 'prompt' || v.ready)
    .map((v) => ({ type: v.type, name: v.name, id: v.id, usage_mode: v.usageMode }));
}
