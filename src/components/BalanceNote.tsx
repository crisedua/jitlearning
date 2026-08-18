import Link from 'next/link';
import { minutesLeft, sessionsLeft, type UsageBalance } from '@/lib/balance';
import { CLASS_CAP_MINUTES, MIN_USEFUL_MINUTES } from '@/lib/class-length';

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
          {/*
            "Enough to finish what you are doing" stopped being true at the
            bottom of this range.
            
            The gate only refuses a class once the minutes are gone, so somebody
            with one left can still start one, and this told them it would reach
            the end of a task. It cannot: below MIN_USEFUL_MINUTES the classroom
            schedules no closing at all, because the class is shorter than the
            warning would be, so there is no version of it that finishes and
            measures anything.
            
            Said rather than blocked. Spending the last minute is theirs to
            choose, and a product that refuses the time somebody already has
            reads worse than one that says what it is worth.
          */}
          <span>
            Te quedan {parts.join(' y ')}
            {lifetime ? ' gratis' : ' este mes'}.{' '}
            {left !== null && left <= MIN_USEFUL_MINUTES
              ? 'No alcanza para una clase que termine y mida una tarea.'
              : 'Alcanza para terminar lo que estás haciendo.'}
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
          {/*
            How long one class is, because the allowance does not say it.
            
            A class ends at CLASS_CAP_MINUTES whatever the balance holds. Read
            "20 de 20 minutos" and pressed start, a learner expects one long
            session and gets cut at ten with half the allowance apparently
            unspent, which reads as being shortchanged rather than as a class
            ending. Saying the length here turns the same event into the thing
            they were told would happen, and makes the second class an obvious
            move instead of a workaround.
            
            Only when there is more than one class left in the balance: if the
            ceiling is not what ends the next class, naming it is noise.
          */}
          {left !== null && left > CLASS_CAP_MINUTES && (
            <> Cada clase dura {CLASS_CAP_MINUTES} minutos.</>
          )}
        </span>
      )}
    </p>
  );
}
