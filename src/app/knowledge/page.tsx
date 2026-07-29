import { KnowledgeManager } from '@/components/KnowledgeManager';

export const dynamic = 'force-dynamic';

export default function KnowledgePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Base de conocimiento</h1>
        <p className="mt-1 text-sm text-gray-400">
          Sube archivos, extrae enlaces o pega notas. Todo se divide, se convierte en
          vectores y se indexa para que el coach recupere solo lo que hace falta.
        </p>
      </div>
      <KnowledgeManager />
    </div>
  );
}
