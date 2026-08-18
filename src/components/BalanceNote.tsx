import Link from 'next/link';
import { minutesLeft, sessionsLeft, type UsageBalance } from '@/lib/balance';

/**
 * What is left, said before the button rather than discovered at it.
 *
 * Renders nothing for unlimited plans and for deployments where the usage view is
 * unavailable: a meter that cannot be read is better absent than wrong.
 *
 * ## The window has to be named correctly
 *
 * The free tier is a lifetime 20 minutes, and this used to describe it as a
 * monthly allowance that resets on the 1st. That was a lie told at the single
 * worst moment in the product: a learner who has just finished a real task, seen
 * what it saves, and run out of minutes was pointed at a reset that never comes
 * instead of at the plan. `balance.period` is what fixes it, and the exhausted
 * copy now differs by window because the two situations call for opposite advice.
 *
 * ## Running out is the moment to make the offer
 *
 * Not a wall with an apology behind it. Somebody at the end of the free tier has
 * exactly the information needed to decide, so the note links to the plans rather
 * than leaving them to find the page.
 */
export function BalanceNote({ balance }: { balance: UsageBalance }) {
  const { monthlyMinutes, monthlySessions, period } = balance;
  if (monthlyMinutes === null && monthlySessions === null) return null;

  const left = minutesLeft(balance);
  const sessionsRemaining = sessionsLeft(balance);
  const exhausted = left === 0 || sessionsRemaining === 0;

  /*
   * "Nearly out" exists so the teacher is not cut off mid-task. Five minutes is
   * about one exercise, which is the smallest unit of work worth starting.
   */
  const nearlyOut = !exhausted && left !== null && left <= 5;
  const lifetime = period === 'total';

  const parts = [
    left !== null && `${left} de ${monthlyMinutes} minutos`,
    sessionsRemaining !== null && `${sessionsRemaining} de ${monthlySessions} conversaciones`,
  ].filter(Boolean);

  return (
    <p
      className={`mt-4 inline-flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-full border px-3.5 py-1.5 text-[13px] ${
        exhausted || nearlyOut
          ? 'border-warning/35 bg-warning-soft/50 text-ink/80'
          : 'border-line bg-surface text-muted'
      }`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 self-center rounded-full ${
          exhausted || nearlyOut ? 'bg-warning' : 'bg-gold'
        }`}
      />

      {exhausted ? (
        <>
          <span>
            {lifetime
              ? `Usaste los ${monthlyMinutes} minutos gratis.`
              : 'Agotaste los minutos de este mes. El contador vuelve a cero el día 1.'}
          </span>
          <Link
            href="/planes"
            className="font-semibold text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            {lifetime ? 'Ver los planes' : 'Subir de plan'}
          </Link>
        </>
      ) : nearlyOut ? (
        <>
          <span>
            Te quedan {parts.join(' y ')}
            {lifetime ? ' gratis' : ' este mes'}. Alcanza para terminar lo que estás haciendo.
          </span>
          <Link
            href="/planes"
            className="font-semibold text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            Ver los planes
          </Link>
        </>
      ) : (
        <span>
          {lifetime ? 'Te quedan' : 'Este mes te quedan'} {parts.join(' y ')} de clase
          {lifetime ? ' gratis' : ''}.
        </span>
      )}
    </p>
  );
}
