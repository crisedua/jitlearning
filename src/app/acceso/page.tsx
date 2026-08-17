import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser, authConfigured } from '@/lib/supabase/server';
import { safeReturnPath, signInPath } from '@/lib/paths';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Entrar · ModoJIT',
};

/**
 * Supabase reports failures by sending the learner back here with `?error=`.
 * These are the ones a person can actually run into; anything else falls
 * through to a generic message rather than showing a raw provider string.
 */
const ERRORS: Record<string, string> = {
  missing_code: 'Google no devolvió el código de acceso. Vuelve a intentarlo.',
  access_denied: 'No autorizaste el acceso. Hace falta aceptar para poder entrar.',
  oauth_start_failed:
    'No se pudo iniciar el proceso con Google. Si vuelve a pasar, avisa a quien administra el sitio.',
  unconfigured:
    'El inicio de sesión no está configurado en este despliegue. Avisa a quien lo administra.',
};

export default async function AccesoPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnPath(params.next);

  // Already signed in: this page has nothing to offer, so skip straight through.
  if (await currentUser()) redirect(returnTo);

  const configured = authConfigured();
  const errorCode = params.error ?? (configured ? undefined : 'unconfigured');
  const error = errorCode
    ? (ERRORS[errorCode] ??
      'No se pudo completar el inicio de sesión. Inténtalo de nuevo.')
    : null;

  return (
    <div className="mx-auto flex max-w-md flex-col px-6 py-16 sm:py-24">
      <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
        <span aria-hidden className="inline-block h-px w-[34px] bg-gold" />
        Acceso
      </p>
      <h1 className="mt-3 font-serif text-[clamp(2rem,4.5vw,2.75rem)] font-normal leading-[1.05] tracking-[-0.02em]">
        {error ? 'No pudimos entrar' : 'Entra para empezar tu clase'}
      </h1>
      <p className="mt-3 text-[17px] leading-relaxed text-muted">
        Cada conversación es una sesión de voz real, así que pedimos que entres con tu
        cuenta de Google antes de empezar. No publicamos nada ni te escribimos.
      </p>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-lg border border-warning/25 bg-warning-soft/60 px-4 py-3 text-sm leading-relaxed text-ink/85"
        >
          {error}
        </p>
      )}

      {/*
        A link, not a form: /auth/login is the one place that starts the
        handshake, and it is the same URL the coach page redirects to. Two ways
        into an OAuth flow is two things to keep correct.
      */}
      {configured ? (
        <Link
          href={signInPath(returnTo)}
          prefetch={false}
          className="mt-8 inline-flex w-full items-center justify-center gap-3 rounded-full border border-line bg-surface px-5 py-3 text-[15px] font-medium text-ink transition duration-200 ease-out hover:-translate-y-0.5 hover:border-gold"
        >
          <GoogleGlyph />
          {error ? 'Reintentar con Google' : 'Continuar con Google'}
        </Link>
      ) : (
        <span
          aria-disabled
          className="mt-8 inline-flex w-full cursor-not-allowed items-center justify-center gap-3 rounded-full border border-line bg-surface px-5 py-3 text-[15px] font-medium text-ink opacity-50"
        >
          <GoogleGlyph />
          Continuar con Google
        </span>
      )}

      <p className="mt-6 text-xs leading-relaxed text-soft">
        Google nos comparte tu nombre, tu correo y tu foto de perfil. Guardamos eso y el
        registro de tus clases, para saber cuánto has usado tu plan.
      </p>
    </div>
  );
}

/** Google's mark, inline: the button must not wait on a network request. */
function GoogleGlyph() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 18 18">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
