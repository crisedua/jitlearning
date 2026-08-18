/**
 * The feedback that came in, and the deal it earns.
 *
 * /feedback promises three months of Fundador to the first ten people who say
 * what they really think. Until this page existed, that feedback landed in a
 * table nothing read: the form said thank you, the row was inserted, and the
 * promise depended on somebody remembering to go and look with a SQL client.
 *
 * Losing the mechanism that recruits your first users is the most expensive
 * silence a product can have, because it costs you the thing you cannot get any
 * other way. Everything else in this app can be inferred from the code. What ten
 * people think of it cannot.
 *
 * Not linked from anywhere, gated on identity, `noindex`. The gate is the
 * protection, not the obscurity.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { checkAdmin } from '@/lib/admin';
import { signInPath } from '@/lib/paths';
import { NotAdmin } from '@/components/NotAdmin';
import { serviceConfigured, supabaseAdmin } from '@/lib/supabase/admin';
import { listGrants, seatsLeft, type Grant } from '@/lib/grants';
import { FEEDBACK_REWARD } from '@/lib/site';
import { GrantButton } from './GrantButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Feedback · ModoJIT',
  robots: { index: false, follow: false },
};

interface Entry {
  id: string;
  createdAt: string;
  userId: string | null;
  name: string;
  email: string;
  message: string;
}

async function loadFeedback(): Promise<Entry[] | null> {
  if (!serviceConfigured()) return null;

  const { data, error } = await supabaseAdmin()
    .from('feedback')
    .select('id, created_at, user_id, name, email, message')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return null;

  return (
    data as Array<{
      id: string;
      created_at: string;
      user_id: string | null;
      name: string;
      email: string;
      message: string;
    }>
  ).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    message: row.message,
  }));
}

export default async function AdminFeedbackPage() {
  const gate = await checkAdmin();
  if (!gate.ok) {
    if (gate.reason === 'anonymous') redirect(signInPath('/admin/feedback'));
    // Signed in as somebody else. Say so rather than bouncing them to the
    // marketing page, which is indistinguishable from the page being broken.
    return <NotAdmin email={gate.email} path="/admin/feedback" />;
  }

  const [entries, grants] = await Promise.all([loadFeedback(), listGrants()]);
  const left = seatsLeft(grants);
  const granted = new Set(grants.map((g) => g.userId));

  return (
    <section className="mx-auto max-w-[70rem] px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Operación</p>
      <h1 className="mt-4 max-w-[24ch] font-serif text-[clamp(2rem,4.5vw,3rem)] font-normal leading-[1.06] tracking-[-0.02em]">
        Lo que dijeron
      </h1>
      <p className="mt-5 max-w-[62ch] text-[17px] leading-relaxed text-muted">
        El trato es {FEEDBACK_REWARD.months} meses de {FEEDBACK_REWARD.plan} para las primeras{' '}
        {FEEDBACK_REWARD.seats} personas. Quedan <strong>{left}</strong>. Activar es una decisión
        tuya: lee lo que escribieron primero.
      </p>

      {entries === null ? (
        <p className="mt-10 rounded-lg border border-warning/35 bg-warning-soft/50 px-4 py-3 text-[15px] leading-relaxed text-ink/80">
          No se pudo leer <code className="font-mono text-[13px]">feedback</code>. Falta{' '}
          <code className="font-mono text-[13px]">SUPABASE_SERVICE_ROLE_KEY</code>, o la migración{' '}
          <code className="font-mono text-[13px]">20260806000000_feedback.sql</code> no se ha
          corrido.
        </p>
      ) : entries.length === 0 ? (
        <p className="mt-10 rounded-lg border border-line bg-surface px-5 py-4 text-[15px] leading-relaxed text-muted">
          Nadie ha dejado feedback todavía. Es el número que más importa en esta pantalla y no se
          arregla escribiendo código: hay que pedírselo a diez personas, una por una.
        </p>
      ) : (
        <ul className="mt-10 space-y-4">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-line bg-surface p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-[15px] font-medium">
                  {entry.name}{' '}
                  <span className="font-normal text-soft">· {entry.email}</span>
                </span>
                <span className="font-mono text-[13px] text-soft">
                  {new Date(entry.createdAt).toLocaleDateString('es-CL')}
                </span>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-ink/85">
                {entry.message}
              </p>

              <div className="mt-4 border-t border-line pt-3">
                {!entry.userId ? (
                  /*
                   * Feedback is deliberately open to people who never signed in,
                   * because somebody who bounced has the feedback a signup flow
                   * never hears. The cost is that there is no account to put the
                   * plan on, and that is worth saying here rather than showing a
                   * button that cannot work.
                   */
                  <p className="text-[13px] leading-relaxed text-soft">
                    Sin cuenta: escribió sin haber entrado. Pídele que entre con Google y vuelve a
                    esta página.
                  </p>
                ) : granted.has(entry.userId) ? (
                  <GrantedNote grant={grants.find((g) => g.userId === entry.userId)!} />
                ) : left <= 0 ? (
                  <p className="text-[13px] leading-relaxed text-soft">
                    No quedan cupos de los {FEEDBACK_REWARD.seats}.
                  </p>
                ) : (
                  <GrantButton userId={entry.userId} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-14 max-w-[75ch] border-t border-line pt-6 text-[13px] leading-relaxed text-soft">
        Dónde se cae la gente antes de llegar hasta acá está en{' '}
        <Link href="/admin/embudo" className="text-accent underline underline-offset-2">
          /admin/embudo
        </Link>
        .
      </p>
    </section>
  );
}

/** A grant already made, and whether it is still running. */
function GrantedNote({ grant }: { grant: Grant }) {
  const until = grant.until ? new Date(grant.until).toLocaleDateString('es-CL') : null;

  return (
    <p className="text-[13px] leading-relaxed text-muted">
      {grant.expired ? (
        <>
          Tuvo {FEEDBACK_REWARD.plan} y ya se venció{until ? ` el ${until}` : ''}. Volvió a free la
          última vez que intentó una clase.
        </>
      ) : (
        <>
          {FEEDBACK_REWARD.plan} activo hasta el {until}. Se vence solo.
        </>
      )}
    </p>
  );
}
