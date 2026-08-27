'use client';

import { useState } from 'react';
import { connectionMessage } from '@/lib/errors';
import {
  EMPLOYMENT,
  EMPLOYMENT_HINT,
  EMPLOYMENT_LABEL,
  type Employment,
} from '@/lib/signup';

/**
 * The sign-up form.
 *
 * Plain controlled inputs, one POST, two terminal states — the same shape as
 * `FeedbackForm`, deliberately, because they are the same kind of thing and a
 * second pattern for it would be a second pattern to keep correct.
 *
 * ## Signing up is not having an account, and the form has to say so
 *
 * There is no password here. Identity on this site is Google, through /acceso,
 * and this form writes a row to `signups` — which is the point: the people worth
 * capturing are the ones who have not decided to authenticate yet. But that
 * means somebody can finish this, see a green box, and reasonably believe they
 * are enrolled. They are not, and the class is behind the Google gate.
 *
 * So the success state names the remaining step instead of congratulating them,
 * and names it while they are still looking at the screen. `FeedbackForm` learnt
 * this the expensive way about its own promise; this one starts there.
 */

/**
 * How long a request may hang before it is treated as failed. `fetch` waits
 * forever on a connection that stalls after the handshake, which leaves the
 * button disabled reading its busy label with nothing to press.
 */
const REQUEST_TIMEOUT_MS = 15_000;

const FIELD =
  'w-full rounded-md border border-field bg-surface px-3.5 py-2.5 text-[15px] text-ink transition-colors duration-150 ease-out placeholder:text-muted hover:border-line-strong focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft';

const LABEL = 'mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-muted';

export function SignupForm({
  defaultName = '',
  defaultEmail = '',
  signedIn = false,
}: {
  defaultName?: string;
  defaultEmail?: string;
  /** Whether the remaining step — entering with Google — is already done. */
  signedIn?: boolean;
}) {
  const [fullName, setFullName] = useState(defaultName);
  const [callName, setCallName] = useState('');
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState('');
  const [employment, setEmployment] = useState<Employment | ''>('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; email: string } | null>(null);

  if (done) {
    return (
      <div className="rounded-lg border border-success/25 bg-success-soft/60 p-6">
        <p className="font-serif text-[22px] leading-snug tracking-[-0.01em]">
          Listo, {done.name}. Quedaste registrado.
        </p>
        {signedIn ? (
          <p className="mt-2 text-[15px] leading-relaxed text-ink/80">
            Ya tienes cuenta, así que no falta nada más: puedes entrar a tu primera clase
            cuando quieras.
          </p>
        ) : (
          <p className="mt-2 text-[15px] leading-relaxed text-ink/80">
            Falta un paso, y es el que abre la clase: entra con Google usando{' '}
            <span className="font-medium">{done.email}</span>. Las clases son sesiones de voz
            reales y se abren sobre una cuenta — sin eso, quedaste en la lista y nada más.
          </p>
        )}
        <a
          href="/coach"
          className="mt-5 inline-flex items-center gap-2.5 rounded-full bg-accent px-6 py-3 text-[16px] font-medium text-bg transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-hover"
        >
          {signedIn ? 'Empezar mi clase' : 'Entrar con Google y empezar'}
        </a>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSending(true);
        setError(null);
        void fetch('/api/signups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName, callName, email, phone, employment }),
          signal: AbortSignal.timeout?.(REQUEST_TIMEOUT_MS),
        })
          .then(async (res) => {
            const data = (await res.json()) as { ok?: boolean; error?: string };
            if (!res.ok || !data.ok) throw new Error(data.error ?? 'No se pudo enviar.');
            setDone({
              // The same fallback the route applies, so the confirmation greets
              // them by the name that was actually stored.
              name: callName.trim() || fullName.trim().split(/\s+/)[0] || '',
              email: email.trim().toLowerCase(),
            });
          })
          .catch((err: unknown) => {
            setError(
              connectionMessage(err) ?? (err instanceof Error ? err.message : 'No se pudo enviar.'),
            );
          })
          .finally(() => setSending(false));
      }}
      className="space-y-5"
    >
      <label className="block">
        <span className={LABEL}>Tu nombre</span>
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          maxLength={200}
          autoComplete="name"
          className={FIELD}
        />
      </label>

      <label className="block">
        <span className={LABEL}>Cómo quieres que te llame</span>
        <input
          value={callName}
          onChange={(e) => setCallName(e.target.value)}
          maxLength={80}
          autoComplete="nickname"
          placeholder={fullName.trim().split(/\s+/)[0] || 'Fran'}
          className={FIELD}
        />
        {/*
          Optional, and the placeholder shows what happens if it is left alone,
          which is the honest way to make a field skippable: the fallback is
          visible before the decision rather than discovered afterwards.
        */}
        <span className="mt-1.5 block text-[13px] text-soft">
          El profesor te habla en voz alta, así que este es el nombre que va a decir. Si lo
          dejas vacío, usa el primero de arriba.
        </span>
      </label>

      <label className="block">
        <span className={LABEL}>Tu correo</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={320}
          autoComplete="email"
          className={FIELD}
        />
        <span className="mt-1.5 block text-[13px] text-soft">
          Usa el mismo con el que vas a entrar con Google: es lo que junta tu registro con tu
          cuenta.
        </span>
      </label>

      <label className="block">
        <span className={LABEL}>Tu teléfono</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          maxLength={40}
          autoComplete="tel"
          placeholder="+56 9 1234 5678"
          className={FIELD}
        />
      </label>

      <fieldset>
        <legend className={LABEL}>¿En qué estás ahora?</legend>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {EMPLOYMENT.map((id) => {
            const active = employment === id;
            return (
              <label
                key={id}
                className={`cursor-pointer rounded-md border px-3.5 py-3 transition-colors duration-150 ease-out ${
                  active
                    ? 'border-accent bg-accent-soft/50'
                    : 'border-field bg-surface hover:border-line-strong'
                }`}
              >
                <input
                  type="radio"
                  name="employment"
                  value={id}
                  checked={active}
                  onChange={() => setEmployment(id)}
                  required
                  className="sr-only"
                />
                <span className="block text-[15px] font-medium text-ink">
                  {EMPLOYMENT_LABEL[id]}
                </span>
                <span className="mt-1 block text-[13px] leading-snug text-soft">
                  {EMPLOYMENT_HINT[id]}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger/25 bg-danger-soft/60 px-4 py-3 text-sm text-ink/85"
        >
          {error}
        </p>
      )}

      <button
        disabled={sending}
        className="inline-flex items-center gap-2.5 rounded-full bg-accent px-6 py-3 text-[16px] font-medium text-bg transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-hover disabled:translate-y-0 disabled:opacity-55"
      >
        {sending ? 'Enviando…' : 'Registrarme'}
      </button>
    </form>
  );
}
