import Link from 'next/link';
import { AnimatedSteps } from '@/components/AnimatedSteps';
import { SessionPreview } from '@/components/SessionPreview';
import { CLOSING, CURRICULUM_BAND, HERO, PROMISES, TAGLINE } from '@/lib/site';
import { LEVELS, WEEKLY_MAX, WEEKLY_MIN, lessonsForLevel } from '@/lib/curriculum';
import { ASSUMED_SESSION_MINUTES, FREE_PLAN, spellMinutes } from '@/lib/plans';

export const metadata = {
  title: `ModoJIT · ${TAGLINE}`,
  description:
    `Un profesor por voz, en español, que te entrevista sobre tu trabajo, te arma un plan de ${LEVELS.length} niveles y te enseña a usar IA con tus propias tareas.`,
};

export default function HomePage() {
  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="mx-auto grid max-w-[75rem] items-center gap-14 px-6 pb-24 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pb-28 lg:pt-24">
        <div>
          <p className="animate-rise flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-accent [animation-delay:60ms]">
            <span
              aria-hidden
              className="inline-block h-px w-[34px] origin-left bg-gold [animation:wipe_0.8s_var(--ease-out)_0.3s_both]"
            />
            Clases por voz
          </p>

          <h1 className="animate-rise mt-5 font-serif text-[clamp(2.75rem,7vw,4.75rem)] font-normal leading-[1.02] tracking-[-0.02em] [animation-delay:140ms]">
            {HERO.title}
          </h1>

          <p className="animate-rise mt-7 max-w-[48ch] text-[19px] leading-[1.58] text-body [animation-delay:400ms]">
            {HERO.sub}
          </p>

          <div className="animate-rise mt-9 flex flex-wrap items-center gap-3.5 [animation-delay:520ms]">
            <Link
              href="/coach"
              className="inline-flex items-center gap-3 rounded-full bg-gold px-7 py-4 text-[17px] font-semibold text-ink shadow-[0_10px_30px_-12px_rgba(138,98,23,0.55)] transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-gold-light"
            >
              Empezar la primera clase
              <span aria-hidden className="font-mono">
                →
              </span>
            </Link>
            {/*
              A link, not a second button.

              Two pills side by side made these read as a choice between equals,
              and they are not: one starts the class, the other is for somebody
              who wants to look before starting. Dropping the border says that
              without saying it, and it leaves the gold as the only filled shape
              in the hero, which is what makes it the obvious thing to press.
            */}
            <a
              href="#curriculum"
              className="text-[17px] font-medium text-ink underline-offset-4 transition-colors duration-200 hover:text-accent hover:underline"
            >
              Ver el currículum
            </a>
          </div>

          {/*
            The most-read line on the site, and the fifth place still selling
            walking.
            
            Round 38 moved the how-it-works heading and the closing call to
            action off it, because the first class ends with a task actually
            done and that needs a screen — a session dictated on a walk produces
            no second number, so no measured saving and no offer. This line sat
            directly under the main button and kept saying "sirve caminando".
            
            What replaces it is the two things somebody hesitates over before a
            first click, neither of which appeared anywhere near the button: how
            much it costs and whether it wants a card. Walking is still true and
            still sold, one section down, for the sessions where it is the right
            answer.
          */}
          <p className="animate-fade mt-5 text-[13px] text-soft [animation-delay:900ms]">
            Se abre en el navegador · necesita micrófono ·{' '}
            {spellMinutes(FREE_PLAN.monthlyMinutes ?? 0)} gratis, sin tarjeta
          </p>
        </div>

        <div className="animate-rise [animation-delay:340ms]">
          <div className="[animation:float_9s_ease-in-out_infinite]">
            <SessionPreview />
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- Curriculum */}
      {/*
        Rendered from `curriculum.ts`, not retyped here. It is the same object the
        teacher works through and the progress page renders, so what a visitor
        reads before paying is literally the plan they get.
      */}
      <section id="curriculum" className="mx-auto max-w-[75rem] scroll-mt-24 px-6 pb-24 lg:pb-28">
        <p className="reveal text-xs font-semibold uppercase tracking-[0.14em] text-accent">
          El currículum
        </p>
        <h2 className="reveal mt-4 max-w-[24ch] font-serif text-[clamp(2rem,4.5vw,3.25rem)] font-normal leading-[1.08] tracking-[-0.02em]">
          {/*
            Derived, beside a list this page renders from the same array. It
            said "4" as a literal directly above `LEVELS.map(...)`, so retiring
            or adding a level would have left the heading counting the old
            shape while the rows below it showed the new one.
          */}
          {LEVELS.length} niveles, {CURRICULUM_BAND.title}
        </h2>
        <p className="reveal mt-5 max-w-[58ch] text-[17px] leading-relaxed text-muted">
          {CURRICULUM_BAND.body}
        </p>

        {/*
          One level open at a time.

          The 4 levels together were the longest block on this page: 4 purposes
          plus 4 lesson lists, all expanded, in a section that is one of five.
          Laying them sideways in a slider (what this was) moved the text
          without reducing it. Collapsing does reduce it, and the shape is
          honest about the content: 4 levels in sequence, you are looking at one.

          `<details name>` rather than React state, matching how the lesson
          lists were already disclosed here. The browser does the accordion:
          opening one closes the rest, keyboard and screen readers get the real
          thing, and it works before any JavaScript loads. Where `name` is not
          supported yet the levels simply open independently, which is the
          old behaviour rather than a broken one.
        */}
        <div className="mt-12">
          {LEVELS.map((level, i) => {
            const lessons = lessonsForLevel(level.id);
            return (
              <details
                key={level.id}
                name="nivel"
                open={i === 0}
                style={{ animationRange: `entry 0% entry ${55 + i * 6}%` }}
                className="reveal group border-t border-line last:border-b"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 transition-colors duration-200 hover:text-accent [&::-webkit-details-marker]:hidden">
                  <span className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
                    {/*
                      Accent, not gold. The mockup labels these in gold and our
                      gold is a fill colour: at text size on paper it does not
                      clear the contrast floor, which the palette test says out
                      loud rather than leaving to whoever squints at it later.
                    */}
                    <span className="font-mono text-xs text-accent">Nivel {level.number}</span>
                    <span className="font-serif text-[clamp(1.35rem,3vw,1.75rem)] font-normal leading-none tracking-[-0.01em]">
                      {level.title}
                    </span>
                  </span>
                  {/*
                    A plus that becomes a cross. Rotation rather than swapping
                    glyphs, so the open state is legible mid-transition and
                    nothing reflows when it changes.
                  */}
                  <span
                    aria-hidden
                    className="shrink-0 text-xl leading-none text-soft transition-transform duration-300 ease-out group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>

                <div className="animate-rise pb-9">
                  <p className="max-w-[62ch] text-[15px] leading-relaxed text-muted">
                    {level.purpose}
                  </p>

                  {lessons.length > 0 && <LessonList lessons={lessons} className="mt-6" />}

                  {/*
                    The per-task half of level 1 is the part people are buying, so
                    it is stated in the card rather than left implicit in a count.
                  */}
                  {level.perTask && (
                    <p className="mt-5 max-w-[62ch] rounded-md border border-gold/30 bg-gold-soft/30 px-4 py-3 text-[15px] leading-relaxed text-ink/85">
                      Y una clase por cada tarea de tu semana, entre {WEEKLY_MIN} y {WEEKLY_MAX}.
                      Tus tareas, no ejemplos.
                    </p>
                  )}

                  {level.id === 'flujo' && (
                    <p className="mt-4 text-[13px] leading-relaxed text-soft">
                      De estas {lessons.length} haces las que correspondan al camino que elegiste.
                    </p>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </section>

      {/* ----------------------------------------------------------- Promises */}
      <section className="border-y border-line bg-surface-alt py-24 lg:py-28">
        <div className="mx-auto max-w-[75rem] px-6">
          <p className="reveal text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            Lo que sí hace
          </p>
          <h2 className="reveal mt-4 max-w-[24ch] font-serif text-[clamp(2rem,4.5vw,3rem)] font-normal leading-[1.08] tracking-[-0.02em]">
            {PROMISES.length} promesas, comprobables en 1 sesión
          </h2>

          {/*
            The comparison used to be its own section below this one and said
            the same 4 things again. It is the last line of each card now, so
            the claim and the chat window it is measured against are read
            together instead of a scroll apart.

            Hidden until the pointer is on the card, which is a claim about the
            device rather than about the design: `[@media(hover:hover)]` is what
            hides it, so a phone — where there is no cursor to move and no way
            to reveal anything — gets all 4 contrasts visible from the start.
            The line telling you to hover is gated on the same query, because an
            instruction to do something impossible is worse than no instruction.

            It fades in place rather than expanding. Growing the card on hover
            would push the whole grid row, so pointing at one promise would move
            the other 3 out from under the cursor.
          */}
          <p className="reveal mt-4 hidden text-[15px] text-soft [@media(hover:hover)]:block">
            Pasa el cursor sobre cada tarjeta para ver la diferencia con un chat.
          </p>

          <ul className="-mx-6 mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto px-6 pb-3 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-x-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
            {PROMISES.map((promise, i) => (
              <li
                key={promise.key}
                style={{ animationRange: `entry 0% entry ${55 + i * 10}%` }}
                className="reveal group flex w-[82vw] shrink-0 snap-start flex-col rounded-lg border border-line bg-surface p-7 transition duration-300 ease-out hover:-translate-y-1 hover:shadow-md sm:w-auto sm:shrink"
              >
                <h3 className="font-serif text-[22px] font-normal leading-tight tracking-[-0.01em]">
                  {promise.title}
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-muted">{promise.body}</p>
                <p className="mt-auto flex items-start gap-2 pt-5 text-[14px] leading-snug text-soft opacity-100 transition-opacity duration-300 ease-out group-hover:opacity-100 [@media(hover:hover)]:opacity-0">
                  <span aria-hidden className="font-mono text-danger/70">
                    ×
                  </span>
                  {promise.generic}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* --------------------------------------------------------------- Steps */}
      <section
        id="como"
        className="scroll-mt-20 border-y border-line bg-surface-alt py-24 lg:py-28"
      >
        <div className="mx-auto grid max-w-[75rem] items-start gap-14 px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div>
            <p className="reveal text-xs font-semibold uppercase tracking-[0.14em] text-accent">
              Cómo funciona
            </p>
            {/*
              This headline was "15 minutos, caminando", which sold the mode the
              first class works worst in. Walking is genuinely supported and is
              most of the point later on, when the lesson is the lesson. The
              first session is different: it ends with a task done and two
              numbers measured, and both need a screen.
            */}
            <h2 className="reveal mt-4 font-serif text-[clamp(2rem,4.5vw,3rem)] font-normal leading-[1.08] tracking-[-0.02em]">
              {ASSUMED_SESSION_MINUTES} minutos, y algo tuyo queda hecho
            </h2>
          </div>

          <AnimatedSteps />
        </div>
      </section>

      {/* ------------------------------------------------------------ Closing */}
      {/*
        The page went from the how-it-works band straight to "¿Hacemos la
        primera clase?", which asks for the click without ever saying what the
        thing is for. This says it once, plainly, immediately before the button.
      */}
      <section className="mx-auto max-w-[75rem] px-6 pb-4 pt-8 lg:pt-12">
        <h2 className="reveal max-w-[26ch] font-serif text-[clamp(2rem,4.5vw,3rem)] font-normal leading-[1.08] tracking-[-0.02em]">
          {CLOSING.title}
        </h2>
        <p className="reveal mt-5 max-w-[58ch] text-[17px] leading-relaxed text-muted">
          {CLOSING.body}
        </p>
      </section>

      <section className="mx-auto max-w-[75rem] px-6 py-24 lg:py-28">
        <div className="reveal relative overflow-hidden rounded-xl bg-accent-hover px-8 py-16 sm:px-16 sm:py-18">
          <div
            aria-hidden
            className="absolute -right-[10%] -top-[40%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(217,168,59,0.28),transparent_65%)] [animation:float_12s_ease-in-out_infinite]"
          />
          <h2 className="relative max-w-[20ch] font-serif text-[clamp(2.25rem,5vw,3.75rem)] font-normal leading-[1.04] tracking-[-0.02em] text-bg">
¿Hacemos la primera clase?
          </h2>
          <div className="relative mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/coach"
              className="inline-flex items-center gap-3 rounded-full bg-bg px-7 py-4 text-[17px] font-semibold text-accent-deep transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-surface"
            >
              {CLOSING.cta}
              <span
                aria-hidden
                className="h-[7px] w-[7px] rounded-full bg-gold [animation:ring_2.2s_ease-out_infinite]"
              />
            </Link>
            {/*
              "Frente al computador" earns its place here rather than reading as
              a requirement. The first class ends with a task actually done, and
              that only happens if there is a screen to do it on: the teacher
              asks "¿estás frente al computador o caminando?" and, for somebody
              walking, dictates the work to be finished afterwards. Which is a
              good session and not the one the hero above promises, and it
              cannot produce the second number, so it cannot reach the offer.
              Said here, at the moment somebody decides how to start.
            */}
            <span className="text-sm text-bg/75">
              Se abre en el navegador · necesita micrófono ·{' '}
              {spellMinutes(FREE_PLAN.monthlyMinutes ?? 0)} gratis · la primera vez,
              mejor frente al computador
            </span>
          </div>
        </div>
      </section>
    </>
  );
}

/** One level's lesson titles, shared by the mobile summary and the open list. */
function LessonList({
  lessons,
  className,
}: {
  lessons: ReturnType<typeof lessonsForLevel>;
  className?: string;
}) {
  return (
    <ol className={`space-y-2 ${className ?? ''}`}>
      {lessons.map((lesson) => (
        <li key={lesson.id} className="flex items-start gap-2.5">
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
          <span className="text-[15px] leading-snug text-ink/90">{lesson.title}</span>
        </li>
      ))}
    </ol>
  );
}
