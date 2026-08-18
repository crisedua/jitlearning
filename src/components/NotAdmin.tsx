import Link from 'next/link';

/**
 * Signed in, but not as somebody these pages are for.
 *
 * The `AdminCheck` type has said what should happen here since it was written:
 * "Signed in as somebody else. Say so; do not pretend the page is missing." The
 * pages then redirected to `/` anyway, so the actual behaviour was to bounce
 * somebody to the home page with no explanation at all.
 *
 * That is a bad failure everywhere and a circular one on `/admin/estado`, which
 * exists to tell an operator what their deployment is missing. Landing silently
 * on the marketing page is indistinguishable from the page being broken, and the
 * thing it would have told them is very likely that a variable is unset — which
 * is also the reason they were bounced.
 *
 * So it names the address they used and the one variable that fixes it. Not a
 * security leak: they already know what they signed in as, and `ADMIN_EMAILS`
 * being the gate is documented in the repo and in `.env.example`.
 */
export function NotAdmin({ email, path }: { email: string | null; path: string }) {
  return (
    <section className="mx-auto max-w-[42rem] px-6 py-24">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Operación</p>
      <h1 className="mt-4 font-serif text-[clamp(1.75rem,4vw,2.5rem)] font-normal leading-[1.08] tracking-[-0.02em]">
        Esta página no es para esta cuenta
      </h1>

      <p className="mt-5 text-[17px] leading-relaxed text-muted">
        Entraste como{' '}
        <span className="font-medium text-ink">{email ?? 'una cuenta sin correo'}</span>, que no
        está en la lista de administradores.
      </p>

      <p className="mt-4 text-[15px] leading-relaxed text-muted">
        Agrega ese correo a <code className="font-mono text-[13px]">ADMIN_EMAILS</code> en Vercel
        (separados por coma) y vuelve a cargar, o entra con una cuenta que ya esté en la lista.
      </p>

      <p className="mt-8 text-[13px] leading-relaxed text-soft">
        Ibas a <code className="font-mono text-[12px]">{path}</code>.{' '}
        <Link href="/" className="text-accent underline underline-offset-2">
          Volver al inicio
        </Link>
      </p>
    </section>
  );
}
