import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SessionBar } from '@/components/SessionBar';
import { BalanceNote } from '@/components/BalanceNote';
import { OpenCommitment } from '@/components/OpenCommitment';
import { COACHES, type Coach } from '@/lib/coaches';
import { topicsFor } from '@/lib/topics';
import { currentUser } from '@/lib/supabase/server';
import { signInPath } from '@/lib/paths';
import { getUsageBalance, lastCoachChoice } from '@/lib/account';
import { openCommitment } from '@/lib/commitments';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Elige tu coach · ModoJIT',
};

/**
 * The picker.
 *
 * This is `/coach` rather than a new path on purpose: every link in the app
 * already points here — the header, both landing-page calls to action, the
 * pricing page, and the `safeReturnPath` default that catches anyone coming
 * back from Google. Making the picker the thing that lives at the old address
 * means none of them had to change, and a bookmark from before still lands
 * somewhere sensible.
 *
 * Choosing is not a preference here, it is what scopes the conversation. Each
 * coach is a separate agent with its own attached corpus, so this screen
 * decides which material the next session can retrieve at all — which is why
 * the cards say what each one has material *for*, not how each one feels.
 */
export default async function CoachPickerPage() {
  /*
   * Sign-in gate, kept at the entrance even though this page mints nothing.
   * The real check is in `/api/signed-url`, which is what creates the billable
   * credential; this one exists so nobody picks a coach, presses the button and
   * only then discovers they are signed out.
   */
  const user = await currentUser();
  if (!user) redirect(signInPath('/coach'));

  const [balance, commitment, lastCoach] = await Promise.all([
    getUsageBalance(user.id, user.email),
    openCommitment(user.id),
    lastCoachChoice(user.id),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-6 py-10">
      <header>
        <div className="mb-5 flex justify-end">
          <SessionBar />
        </div>
        <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
          <span aria-hidden className="inline-block h-px w-[34px] bg-gold" />
          Estudia por voz
        </p>
        <h1 className="mt-3 font-serif text-[clamp(2.25rem,5vw,3.25rem)] font-normal leading-[1.05] tracking-[-0.02em]">
          ¿Con cuál estudias hoy?
        </h1>
        <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-muted">
          Cada coach tiene su propio material y su propia forma de trabajar contigo. Elige
          el que corresponda a lo que estás estudiando: puedes cambiar cuando quieras.
        </p>

        {balance && (
          <div>
            <BalanceNote balance={balance} />
          </div>
        )}
      </header>

      {/*
        Above the coaches, not below them. Someone arriving with an unfinished
        commitment should meet it before they start choosing something new —
        stacking a fresh topic on top of an untouched one is how advice piles up
        without anything getting done.
      */}
      {commitment && <OpenCommitment commitment={commitment} />}

      {/*
        The coach used last comes first and is marked, rather than being
        auto-opened. Someone who studies PMP daily should not have to hunt for
        it, but jumping straight into a session would take away the choice on
        the one screen whose whole job is choosing.
      */}
      <ul className="grid gap-4 sm:grid-cols-2">
        {[...COACHES]
          .sort((a, b) => Number(b.id === lastCoach) - Number(a.id === lastCoach))
          .map((coach) => (
            <li key={coach.id}>
              <CoachCard coach={coach} isLast={coach.id === lastCoach} />
            </li>
          ))}
      </ul>

      {/*
        After the coaches, not before: feedback comes from having talked to
        one, and the reward reads as an invitation rather than a toll.
      */}
      <Link
        href="/feedback"
        className="group flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-gold/35 bg-gold-soft/30 px-5 py-4 text-[15px] leading-relaxed text-ink/85 transition duration-200 ease-out hover:-translate-y-0.5 hover:border-gold/60"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-warning">
          El trato
        </span>
        <span>
          Lo pruebas, dejas tu feedback y te activo{' '}
          <span className="font-semibold">3 meses gratis del plan Esencial</span>. Solo para las
          primeras 10 personas.
        </span>
        <span aria-hidden className="font-mono text-accent transition-transform duration-200 ease-out group-hover:translate-x-0.5">
          →
        </span>
      </Link>
    </div>
  );
}

function CoachCard({ coach, isLast }: { coach: Coach; isLast?: boolean }) {
  const topics = topicsFor(coach.id);

  /*
   * A coach with no corpus is shown and cannot be opened.
   *
   * Leaving it out entirely would be simpler, but the picker is also where
   * somebody learns what this is becoming, and an announced gap reads better
   * than a silent one. What it must not do is start a conversation: a coach is
   * only listed as open once its agent exists and its session spine is written.
   */
  if (!coach.available) {
    return (
      <div className="flex h-full flex-col rounded-lg border border-dashed border-line bg-surface-alt/40 p-5 sm:p-6">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-soft">
          {coach.tag}
        </span>
        <h2 className="mt-3 font-serif text-[21px] font-normal leading-snug tracking-[-0.01em] text-muted">
          {coach.label}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">{coach.blurb}</p>
        <p className="mt-auto pt-4 text-[13px] leading-relaxed text-soft">
          {coach.outOfScopeNote}
        </p>
      </div>
    );
  }

  return (
    <Link
      href={`/coach/${coach.id}`}
      className={`group flex h-full flex-col rounded-lg border bg-surface p-5 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md sm:p-6 ${
        isLast ? 'border-accent/45 ring-1 ring-accent/15' : 'border-line'
      }`}
    >
      <span className="flex flex-wrap items-center gap-2">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-accent/25 bg-accent-soft/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
          {coach.tag}
        </span>
        {isLast && (
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-soft">
            El último que usaste
          </span>
        )}
      </span>

      <h2 className="mt-3 font-serif text-[21px] font-normal leading-snug tracking-[-0.01em]">
        {coach.label}
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">{coach.blurb}</p>

      {/*
        One real question per topic. The blurb says what the coach is about; a
        question says what it can be asked, which is the thing somebody is
        actually trying to work out while choosing.
      */}
      {topics.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {topics.slice(0, 3).map((topic) => (
            <li
              key={topic.title}
              className="flex items-start gap-2 text-[13px] leading-relaxed text-muted"
            >
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" />
              <span>«{topic.examples[0]}»</span>
            </li>
          ))}
        </ul>
      )}

      <span className="mt-auto flex items-center gap-1.5 pt-5 text-[13px] font-medium text-accent">
        Estudiar con este coach
        <span
          aria-hidden
          className="transition-transform duration-200 ease-out group-hover:translate-x-0.5"
        >
          →
        </span>
      </span>
    </Link>
  );
}
