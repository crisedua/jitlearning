'use client';

import { useState } from 'react';

/**
 * The form that trades feedback for access.
 *
 * Plain controlled inputs, one POST, two terminal states. The success state
 * repeats the submitted email back on purpose: the six months arrive through
 * that address, so a typo is worth catching while the person is still looking
 * at the screen.
 */
export function FeedbackForm({ defaultEmail = '' }: { defaultEmail?: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState(defaultEmail);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (sentTo) {
    return (
      <div className="rounded-lg border border-success/25 bg-success-soft/60 p-6">
        <p className="font-serif text-[22px] leading-snug tracking-[-0.01em]">
          Gracias. Tu feedback quedó guardado.
        </p>
        <p className="mt-2 text-[15px] leading-relaxed text-ink/80">
          Si estás entre las primeras 10 personas, te escribiremos a{' '}
          <span className="font-medium">{sentTo}</span> para activar tus 3 meses del plan
          Esencial.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSending(true);
        setError(null);
        void fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, message }),
        })
          .then(async (res) => {
            const data = (await res.json()) as { ok?: boolean; error?: string };
            if (!res.ok || !data.ok) throw new Error(data.error ?? 'No se pudo enviar.');
            setSentTo(email.trim());
          })
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : 'No se pudo enviar.');
          })
          .finally(() => setSending(false));
      }}
      className="space-y-5"
    >
      <label className="block">
        <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          Tu nombre
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={200}
          autoComplete="name"
          className="w-full rounded-md border border-field bg-surface px-3.5 py-2.5 text-[15px] text-ink transition-colors duration-150 ease-out placeholder:text-muted hover:border-line-strong focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          Tu correo
        </span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={320}
          autoComplete="email"
          className="w-full rounded-md border border-field bg-surface px-3.5 py-2.5 text-[15px] text-ink transition-colors duration-150 ease-out placeholder:text-muted hover:border-line-strong focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft"
        />
        <span className="mt-1.5 block text-[13px] text-soft">
          A este correo llegan los 3 meses de acceso. Revísalo antes de enviar.
        </span>
      </label>

      <label className="block">
        <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          Tu feedback
        </span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          minLength={10}
          maxLength={5000}
          rows={6}
          placeholder="Qué probaste, qué te sirvió, qué te frustró, qué cambiarías…"
          className="w-full resize-y rounded-md border border-field bg-surface px-3.5 py-2.5 text-[15px] leading-relaxed text-ink transition-colors duration-150 ease-out placeholder:text-muted hover:border-line-strong focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft"
        />
      </label>

      {error && (
        <p role="alert" className="rounded-md border border-danger/25 bg-danger-soft/60 px-4 py-3 text-sm text-ink/85">
          {error}
        </p>
      )}

      <button
        disabled={sending}
        className="inline-flex items-center gap-2.5 rounded-full bg-accent px-6 py-3 text-[16px] font-medium text-bg transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-hover disabled:translate-y-0 disabled:opacity-55"
      >
        {sending ? 'Enviando…' : 'Enviar mi feedback'}
      </button>
    </form>
  );
}
