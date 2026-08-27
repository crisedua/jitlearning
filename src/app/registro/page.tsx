import type { Metadata } from 'next';
import { SignupForm } from '@/components/SignupForm';
import { currentUser } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Registro · ModoJIT',
  description:
    'Déjanos tus datos y empieza tus clases de IA por voz, en español, sobre tu propio trabajo.',
};

export const dynamic = 'force-dynamic';

/**
 * The sign-up page: public, and public in a way the rest of the site is not.
 *
 * /acceso is the Google gate and /coach is behind it. This sits before both, on
 * purpose — it is the page a link in a message can land on, where somebody who
 * has never heard of any of this can say who they are in four fields without
 * first handing over an account.
 *
 * A visitor who *is* signed in gets their name and email filled in from the
 * session. Not to save them typing so much as to keep one person from becoming
 * two records: the email is what joins this row to their account later, and a
 * pre-filled one cannot be typed differently from the one they authenticated
 * with.
 */
export default async function RegistroPage() {
  const user = await currentUser().catch(() => null);

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 lg:py-20">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Registro</p>
      <h1 className="mt-4 font-serif text-[clamp(2rem,5vw,3rem)] font-normal leading-[1.06] tracking-[-0.02em]">
        Cuéntanos quién eres y empezamos
      </h1>
      <p className="mt-5 max-w-[58ch] text-[17px] leading-relaxed text-muted">
        Son cuatro datos y toma menos de un minuto. Sirven para dos cosas concretas: que el
        profesor sepa cómo llamarte cuando te hable, y que las clases partan desde el trabajo
        que tienes hoy en vez de desde cero.
      </p>

      <div className="mt-10">
        <SignupForm
          defaultName={
            (user?.user_metadata?.full_name as string | undefined) ??
            (user?.user_metadata?.name as string | undefined) ??
            ''
          }
          defaultEmail={user?.email ?? ''}
          signedIn={Boolean(user)}
        />
      </div>

      <p className="mt-8 text-[13px] leading-relaxed text-soft">
        Tus datos quedan guardados para contactarte sobre las clases y nada más. No los
        compartimos ni los vendemos; puedes pedir que los borremos cuando quieras. Los detalles
        están en la{' '}
        <a href="/privacidad" className="underline decoration-line-strong underline-offset-2 hover:text-ink">
          política de privacidad
        </a>
        .
      </p>
    </div>
  );
}
