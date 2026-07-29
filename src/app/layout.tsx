import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aprendizaje JIT',
  description: 'Coach de aprendizaje justo a tiempo con agentes de voz de ElevenLabs y RAG',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <header className="border-b border-[var(--color-line)]">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
            <span className="font-semibold tracking-tight">Aprendizaje JIT</span>
            <Link href="/" className="text-sm text-gray-400 hover:text-white">
              Coach
            </Link>
            <Link href="/knowledge" className="text-sm text-gray-400 hover:text-white">
              Conocimiento
            </Link>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
