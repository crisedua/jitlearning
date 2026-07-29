import { KnowledgeManager } from '@/components/KnowledgeManager';

export const dynamic = 'force-dynamic';

export default function KnowledgePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-7 px-6 py-10">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
          Administración
        </p>
        <h1 className="mt-3 font-serif text-[clamp(2rem,4vw,2.75rem)] font-normal leading-[1.08] tracking-[-0.02em]">
          Base de conocimiento
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
          Sube archivos, extrae enlaces o pega notas. Todo se divide, se convierte en
          vectores y se indexa para que el coach recupere solo lo que hace falta.
        </p>
      </header>
      <KnowledgeManager />
    </div>
  );
}
