import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase/server';
import { signInPath } from '@/lib/paths';
import { readTranscript } from '@/lib/transcripts';
import { TEACHER } from '@/lib/teacher';

export const dynamic = 'force-dynamic';

/**
 * One class, read back.
 *
 * The notebook keeps what a class produced — the task, the commitment, the two
 * numbers — and for a long time that was all it kept. Somebody looked at the
 * classroom and asked where their conversations had been saved; they had not
 * been. This is the page that answer was missing.
 *
 * Addressed by conversation id rather than by the summary's row id, because the
 * conversation is the thing that exists on both sides: it is what ElevenLabs
 * bills under, what the post-call webhook matches on, and what the transcript
 * is filed under. A class with a summary but no stored words is a normal state
 * — every class from before this shipped is one — so the page says so plainly
 * instead of pretending to be a 404.
 */
export default async function ClasePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  const { id } = await params;

  if (!user) redirect(signInPath(`/progreso/clase/${id}`));

  /*
   * The read is scoped to this user inside `readTranscript`, so an id belonging
   * to somebody else comes back null and lands on the same message as a class
   * that was never stored. Deliberately the same message: telling a stranger
   * "that class exists but is not yours" answers a question they should not be
   * able to ask.
   */
  const turns = await readTranscript(user.id, id);

  return (
    <main className="mx-auto max-w-[52rem] px-6 py-12 lg:py-16">
      <Link
        href="/progreso"
        className="inline-flex items-center gap-1.5 text-[14px] font-medium text-accent transition-colors duration-150 ease-out hover:text-accent-hover"
      >
        <span aria-hidden>←</span>
        Volver a tu registro
      </Link>

      <h1 className="mt-5 font-serif text-[clamp(1.75rem,4vw,2.5rem)] font-normal leading-[1.08] tracking-[-0.02em]">
        Tu clase, palabra por palabra
      </h1>

      {!turns || turns.length === 0 ? (
        <section className="mt-8 rounded-lg border border-line bg-surface-alt/50 p-6">
          <h2 className="font-serif text-[22px] font-normal leading-snug">
            De esta clase no quedaron las palabras.
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Las clases anteriores a este cuaderno guardaron lo que aprendiste y lo que te
            comprometiste a hacer, pero no la conversación. Las que hagas desde ahora quedan acá
            enteras.
          </p>
        </section>
      ) : (
        <>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            {turns.length} intervenciones. Lo que dijiste tú y lo que te dijo {TEACHER.label}, en
            el orden en que pasó.
          </p>

          <ol className="mt-9 space-y-5">
            {turns.map((turn, i) => {
              const mine = turn.role === 'user';
              return (
                <li
                  key={`${i}-${turn.at}`}
                  style={{ animationRange: `entry 0% entry ${Math.min(60 + i * 4, 90)}%` }}
                  className={`reveal flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                >
                  <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-soft">
                    {mine ? 'Tú' : TEACHER.label}
                    {/*
                      The clock is the only thing here that is not the words, and
                      it earns its place: a class runs to ten minutes and the
                      thing somebody comes back looking for is usually "the part
                      near the end", which is a time, not a phrase.
                    */}
                    <span aria-hidden className="ml-2 font-mono font-normal tracking-normal">
                      {Math.floor(turn.at / 60)}:{String(turn.at % 60).padStart(2, '0')}
                    </span>
                  </p>
                  <p
                    className={`max-w-[85%] whitespace-pre-wrap text-[15px] leading-relaxed ${
                      mine
                        ? 'rounded-[16px_16px_4px_16px] bg-accent px-4 py-3 text-bg'
                        : 'rounded-[16px_16px_16px_4px] border border-line bg-surface px-4 py-3 text-ink'
                    }`}
                  >
                    {turn.message}
                  </p>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </main>
  );
}
