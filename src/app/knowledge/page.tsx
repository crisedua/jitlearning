import { KnowledgeManager } from '@/components/KnowledgeManager';

export const dynamic = 'force-dynamic';

export default function KnowledgePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge base</h1>
        <p className="mt-1 text-sm text-gray-400">
          Upload files, scrape URLs, or paste notes. Everything is chunked, embedded and
          indexed so the coach can retrieve only what a question needs.
        </p>
      </div>
      <KnowledgeManager />
    </div>
  );
}
