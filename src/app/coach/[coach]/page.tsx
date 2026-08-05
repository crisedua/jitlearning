import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { VoiceTutor } from '@/components/VoiceTutor';
import { SessionBar } from '@/components/SessionBar';
import { BalanceNote } from '@/components/BalanceNote';
import { findCoach } from '@/lib/coaches';
import { agentId } from '@/lib/config';
import { currentUser } from '@/lib/supabase/server';
import { signInPath } from '@/lib/paths';
import { getUsageBalance } from '@/lib/account';

/*
 * Always per-request: this page reads the learner's session and their month's
 * balance. No `generateStaticParams` to go with it — prerendering a shell of a
 * page that immediately redirects on cookies would only make the route listing
 * misleading. Unknown slugs are handled by `notFound()` below.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ coach: string }>;
}) {
  const coach = findCoach((await params).coach);
  return { title: coach ? `${coach.label} · ModoJIT` : 'Coach · ModoJIT' };
}

export default async function CoachSessionPage({
  params,
}: {
  params: Promise<{ coach: string }>;
}) {
  const { coach: slug } = await params;

  /*
   * Resolve before anything else, so an unknown or not-yet-written coach is a
   * 404 rather than a page that renders and then fails at the microphone. The
   * same check runs again in `/api/signed-url` — this one is for the person,
   * that one is for the credential.
   */
  const coach = findCoach(slug);
  if (!coach || !coach.available) notFound();

  /*
   * Sign-in gate. This page is the entrance to a billable voice session, so it
   * is the first thing checked after the coach exists.
   *
   * The check is repeated in `/api/signed-url`, which is what actually mints
   * the credential. Gating only the page would stop nobody: the endpoint is a
   * plain GET that anyone can call directly.
   */
  const user = await currentUser();
  if (!user) redirect(signInPath(`/coach/${coach.id}`));

  // Only the agent id is read here — the document list is behind the ingest
  // secret, so this page must not try to fetch it.
  const configured = Boolean(agentId(coach));
  const balance = await getUsageBalance(user.id);

  return (
    <div className="mx-auto max-w-[96rem] space-y-8 px-6 py-10">
      <header>
        <div className="mb-5 flex justify-end">
          <SessionBar />
        </div>

        {/*
          Back to the picker, and named so it reads as a choice that can be
          revisited rather than a browser-back suggestion. Somebody who picked
          wrong finds out one question into the conversation, when the coach
          declines — this is where they go next.
        */}
        <Link
          href="/coach"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors duration-150 ease-out hover:text-accent"
        >
          <span aria-hidden>←</span>
          Cambiar de coach
        </Link>

        <h1 className="mt-3 font-serif text-[clamp(2rem,4.5vw,2.875rem)] font-normal leading-[1.05] tracking-[-0.02em]">
          {coach.label}
        </h1>
        <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-muted">
          {coach.blurb}
        </p>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
          Responde apoyándose en su base de conocimiento, no en generalidades, y te avisa
          cuando no tiene material.
        </p>

        {balance && (
          <div>
            <BalanceNote balance={balance} />
          </div>
        )}
      </header>

      {configured ? (
        <VoiceTutor coach={coach} />
      ) : (
        <section className="max-w-2xl space-y-4 rounded-lg border border-warning/25 bg-warning-soft/60 p-5 text-sm">
          <div>
            <p className="font-semibold text-warning">
              Este coach todavía no está configurado.
            </p>
            <p className="mt-1 leading-relaxed text-ink/80">
              <code className="rounded-sm bg-surface px-1.5 py-0.5 font-mono text-xs">
                {coach.envKey}
              </code>{' '}
              no está definida en este entorno. Si ya creaste el agente, solo tienes que
              añadir la variable y volver a desplegar.
            </p>
          </div>

          <div>
            <p className="font-medium">Crear uno desde este despliegue</p>
            <pre className="mt-1.5 overflow-x-auto rounded-md border border-line bg-surface px-3 py-2.5 font-mono text-xs leading-relaxed text-ink">
              {`curl -X POST "/api/agent/provision?coach=${coach.id}" \\
  -H "x-ingest-secret: $INGEST_SECRET"`}
            </pre>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Usa el id devuelto como{' '}
              <code className="font-mono">{coach.envKey}</code> y vuelve a desplegar. En
              local,{' '}
              <code className="font-mono">npm run setup:agent -- {coach.id}</code> hace lo
              mismo.
            </p>
          </div>

          <p className="text-xs text-muted">
            Revisa qué más falta en <code className="font-mono">/api/health</code> y luego
            añade material en{' '}
            <Link
              href="/knowledge"
              className="rounded-sm font-medium text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              Conocimiento
            </Link>
            .
          </p>
        </section>
      )}
    </div>
  );
}
