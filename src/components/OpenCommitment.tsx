import type { Commitment } from '@/lib/commitments';

/**
 * What you said you would do, asked before you pick anything.
 *
 * This is the whole anti-shelf-help argument made concrete. A book does not
 * come back and ask; neither does a course, a podcast, or a chat window you
 * closed. Putting the commitment on the screen you land on — before the
 * microphone, before anything else — is what makes the follow-up unavoidable
 * rather than something the teacher might get round to.
 *
 * Deliberately not a checkbox. Nothing here can honestly know whether it was
 * done: the learner reports back out loud, in conversation, and a tick box
 * would invite marking it done without doing it, which is the failure mode this
 * exists to attack. So it asks, and the answer belongs in the session.
 */
export function OpenCommitment({ commitment }: { commitment: Commitment }) {
  return (
    <section
      aria-label="Tu compromiso pendiente"
      className="rounded-lg border border-gold/35 bg-gold-soft/25 p-5 sm:p-6"
    >
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-warning">
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-gold [animation:ring_2.2s_ease-out_infinite]"
        />
        Lo que dijiste que ibas a hacer
      </p>

      <p className="mt-3 font-serif text-[clamp(1.15rem,2.4vw,1.5rem)] font-normal leading-snug tracking-[-0.01em] text-ink">
        «{commitment.action}»
      </p>

      {/*
        The deadline and the success signal, quoted as they were said. Not
        parsed into a date and not turned into a countdown — the learner's own
        words are more accurate than anything we could infer from them.
      */}
      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-1.5 text-[13px] leading-relaxed">
        {commitment.due && (
          <div className="flex gap-1.5">
            <dt className="font-semibold text-ink/80">Para:</dt>
            <dd className="text-muted">{commitment.due}</dd>
          </div>
        )}
        {commitment.signal && (
          <div className="flex gap-1.5">
            <dt className="font-semibold text-ink/80">Salió bien si:</dt>
            <dd className="text-muted">{commitment.signal}</dd>
          </div>
        )}
      </dl>

      <p className="mt-4 text-[14px] leading-relaxed text-ink/75">
        Lo acordaste el {commitment.sessionDate}. Retómalo con tu profesor: si lo hiciste,
        construyen sobre lo que salió; si no, lo primero es averiguar qué te lo impidió.
      </p>
    </section>
  );
}
