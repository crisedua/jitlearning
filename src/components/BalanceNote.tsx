import type { UsageBalance } from '@/lib/account';

/**
 * The month's balance, said before the button rather than discovered at it.
 *
 * Shared by the picker and by each coach's page. The quota is pooled per
 * learner per month across every coach, so this deliberately says nothing about
 * which one is open — a per-coach meter would imply per-coach allowances that
 * `plan_usage` does not grant.
 *
 * Renders nothing for unlimited plans and for deployments where the usage view
 * is unavailable — a meter that cannot be read is better absent than wrong.
 * When something has run out it switches to the warning style, and says when
 * it comes back, because "no" without "until when" reads as broken.
 */
export function BalanceNote({ balance }: { balance: UsageBalance }) {
  const { minutes, sessions, monthlyMinutes, monthlySessions } = balance;
  if (monthlyMinutes === null && monthlySessions === null) return null;

  const minutesLeft =
    monthlyMinutes === null ? null : Math.max(0, Math.floor(monthlyMinutes - minutes));
  const sessionsLeft =
    monthlySessions === null ? null : Math.max(0, monthlySessions - sessions);
  const exhausted = minutesLeft === 0 || sessionsLeft === 0;

  const parts = [
    minutesLeft !== null && `${minutesLeft} de ${monthlyMinutes} minutos`,
    sessionsLeft !== null && `${sessionsLeft} de ${monthlySessions} conversaciones`,
  ].filter(Boolean);

  return (
    <p
      className={`mt-4 inline-flex items-baseline gap-2 rounded-full border px-3.5 py-1.5 text-[13px] ${
        exhausted
          ? 'border-warning/35 bg-warning-soft/50 text-ink/80'
          : 'border-line bg-surface text-muted'
      }`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 self-center rounded-full ${exhausted ? 'bg-warning' : 'bg-gold'}`}
      />
      {exhausted
        ? 'Agotaste tu plan de este mes. El contador vuelve a cero el día 1.'
        : `Este mes te quedan ${parts.join(' y ')}. Se comparten entre todos los coaches.`}
    </p>
  );
}
