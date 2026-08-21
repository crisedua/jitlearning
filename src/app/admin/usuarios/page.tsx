import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { checkAdmin } from '@/lib/admin';
import { signInPath } from '@/lib/paths';
import { NotAdmin } from '@/components/NotAdmin';
import { listLearners, type Learner } from '@/lib/people';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Usuarios · ModoJIT',
  robots: { index: false, follow: false },
};

/**
 * Who has an account, and whether the product has worked for them.
 *
 * The other operator pages answer money, funnel and deployment. None of them
 * answered "who is using this", so the question was only reachable through the
 * Supabase dashboard — where an account is a row with no plan beside it, no
 * minutes, and no sign of whether anything ever worked.
 *
 * Gated on identity and `noindex`, like the rest of `/admin`. The gate is the
 * protection, not the obscurity.
 */
export default async function UsuariosPage() {
  const gate = await checkAdmin();
  if (!gate.ok && gate.reason === 'anonymous') redirect(signInPath('/admin/usuarios'));
  if (!gate.ok) return <NotAdmin email={gate.email} path="/admin/usuarios" />;

  const people = await listLearners();

  return (
    <main className="mx-auto max-w-[75rem] px-6 py-12 lg:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Operación</p>
      <h1 className="mt-3 font-serif text-[clamp(1.75rem,4vw,2.5rem)] font-normal leading-[1.08] tracking-[-0.02em]">
        Usuarios
      </h1>

      {!people ? (
        <p className="mt-6 rounded-lg border border-warning/35 bg-warning-soft/40 px-5 py-4 text-[15px] leading-relaxed">
          No hay credenciales de servicio en este despliegue, así que no se puede leer la lista de
          cuentas.
        </p>
      ) : people.learners.length === 0 ? (
        <p className="mt-6 text-[17px] leading-relaxed text-muted">Todavía no se ha registrado nadie.</p>
      ) : (
        <>
          <p className="mt-3 text-[17px] leading-relaxed text-muted">
            {people.learners.length} cuenta{people.learners.length === 1 ? '' : 's'}, la más reciente
            primero.
          </p>

          {/*
            Said out loud rather than left implicit. A list of customers that has
            been cut but looks complete is worse than a short one that admits it.
          */}
          {people.truncated && (
            <p className="mt-3 rounded-md border border-warning/35 bg-warning-soft/40 px-4 py-3 text-[14px] leading-relaxed">
              La lista está cortada: hay más cuentas de las que esta página lee de una vez.
            </p>
          )}

          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse text-left text-[14px]">
              <thead>
                <tr className="border-b border-line-strong text-[11px] font-semibold uppercase tracking-[0.08em] text-soft">
                  <th className="py-3 pr-4 font-semibold">Cuenta</th>
                  <th className="py-3 pr-4 font-semibold">Plan</th>
                  <th className="py-3 pr-4 font-semibold">Min. este mes</th>
                  <th className="py-3 pr-4 font-semibold">Clases</th>
                  <th className="py-3 pr-4 font-semibold">Última clase</th>
                  <th className="py-3 font-semibold">Se guardó</th>
                </tr>
              </thead>
              <tbody>
                {people.learners.map((learner) => (
                  <Row key={learner.id} learner={learner} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="mt-10 text-[14px] leading-relaxed text-muted">
        Esta página solo mira. Para regalar un plan está{' '}
        <Link href="/admin/feedback" className="text-accent underline underline-offset-2">
          /admin/feedback
        </Link>
        , donde el botón está al lado de la promesa que cumple.
      </p>
    </main>
  );
}

function Row({ learner }: { learner: Learner }) {
  const comped = learner.grantedUntil !== null;

  return (
    <tr className="border-b border-line align-top">
      <td className="py-3.5 pr-4">
        <span className="block font-medium text-ink">{learner.email}</span>
        <span className="block text-[12px] text-soft">
          Desde {fecha(learner.joinedAt)}
          {learner.lastSeenAt && ` · visto ${fecha(learner.lastSeenAt)}`}
        </span>
      </td>

      <td className="py-3.5 pr-4">
        <span className="font-medium">{learner.planId}</span>
        {/*
          A comped plan and a bought one look identical in `plan_id`, and telling
          somebody their courtesy month is a subscription is how a person gets
          told there is nothing to cancel minutes after paying — a mistake this
          product has already made once, on /progreso.
        */}
        {comped && (
          <span className="block text-[12px] text-soft">
            de cortesía, hasta {fecha(learner.grantedUntil!)}
          </span>
        )}
        {!comped && learner.subscriptionStatus && (
          <span className="block text-[12px] text-soft">{learner.subscriptionStatus}</span>
        )}
      </td>

      <td className="py-3.5 pr-4 font-mono text-[13px]">{learner.minutesThisMonth}</td>
      <td className="py-3.5 pr-4 font-mono text-[13px]">{learner.classes}</td>
      <td className="py-3.5 pr-4 text-[13px] text-muted">
        {learner.lastClassAt ? fecha(learner.lastClassAt) : '—'}
      </td>

      {/*
        The column that exists because of what happened this month: a missing
        webhook secret had every transcript refused for days, and from the
        outside nothing looked wrong — the classes were recorded and billed
        either way. Classes with no words is that failure, per person.
      */}
      <td className="py-3.5">
        {learner.classes === 0 ? (
          <span className="text-[13px] text-soft">—</span>
        ) : learner.hasTranscripts ? (
          <span className="text-[13px] text-success">sí</span>
        ) : (
          <span className="text-[13px] font-medium text-warning">nada guardado</span>
        )}
      </td>
    </tr>
  );
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
