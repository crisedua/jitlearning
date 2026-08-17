import Link from 'next/link';
import { SessionPreview } from '@/components/SessionPreview';
import { DIFFERENCES, HERO, PROMISES, STEPS, TAGLINE } from '@/lib/site';
import { LEVELS, lessonsForLevel } from '@/lib/curriculum';

export const metadata = {
  title: `ModoJIT · ${TAGLINE}`,
  description:
    'Un profesor por voz, en español, que te entrevista sobre tu trabajo, te arma un plan de 4 niveles y te enseña a usar IA con tus propias tareas.',
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
              className="inline-flex items-center gap-3 rounded-full bg-accent px-7 py-4 text-[17px] font-medium text-bg shadow-[0_10px_30px_-12px_rgba(20,38,63,0.6)] transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-hover"
            >
              Empezar la primera clase
              <span aria-hidden className="font-mono">
                →
              </span>
            </Link>
            <a
              href="#curriculum"
              className="inline-flex items-center rounded-full border border-line-strong bg-surface px-6 py-4 text-[17px] font-medium text-ink transition duration-200 ease-out hover:-translate-y-0.5 hover:border-accent"
            >
              Ver el currículum
            </a>
          </div>

          <p className="animate-fade mt-5 text-[13px] text-soft [animation-delay:900ms]">
            Se abre en el navegador · necesita micrófono · sirve caminando
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
          4 niveles, de fundamentos a portafolio
        </h2>
        <p className="reveal mt-5 max-w-[58ch] text-[17px] leading-relaxed text-muted">
          Los niveles 1 y 3 son clases escritas. El nivel 2 son tus propias tareas, una por
          una, y el 4 es juntar las pruebas en algo que puedas mostrar.
        </p>

        <ul className="mt-12 grid gap-5 lg:grid-cols-2">
          {LEVELS.map((level, i) => {
            const lessons = lessonsForLevel(level.id);
            return (
              <li
                key={level.id}
                style={{ animationRange: `entry 0% entry ${55 + (i % 2) * 10}%` }}
                className="reveal flex flex-col rounded-lg border border-line bg-surface p-7 transition duration-300 ease-out hover:-translate-y-1.5 hover:border-accent/35 hover:shadow-md"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                  Nivel {level.number}
                </p>
                <h3 className="mt-2 font-serif text-[26px] font-normal leading-none tracking-[-0.01em]">
                  {level.title}
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-muted">{level.purpose}</p>

                {lessons.length > 0 && (
                  <ol className="mt-5 space-y-2">
                    {lessons.map((lesson) => (
                      <li key={lesson.id} className="flex items-start gap-2.5">
                        <span
                          aria-hidden
                          className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold"
                        />
                        <span className="text-[15px] leading-snug text-ink/90">
                          {lesson.title}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}

                {/*
                  The per-task half of level 1 is the part people are buying, so
                  it is stated in the card rather than left implicit in a count.
                */}
                {level.perTask && (
                  <p className="mt-4 rounded-md border border-gold/30 bg-gold-soft/30 px-4 py-3 text-[15px] leading-relaxed text-ink/85">
                    Y una clase por cada tarea de tu semana, entre 3 y 5. Esas las define tu
                    diagnóstico: son tus tareas, no ejemplos.
                  </p>
                )}

                {level.id === 'flujo' && (
                  <p className="mt-4 text-[13px] leading-relaxed text-soft">
                    De estas 5 haces las que correspondan al camino que elegiste.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* ----------------------------------------------------------- Promises */}
      <section className="border-y border-line bg-surface-alt py-24 lg:py-28">
        <div className="mx-auto max-w-[75rem] px-6">
          <p className="reveal text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            Lo que sí hace
          </p>
          <h2 className="reveal mt-4 max-w-[24ch] font-serif text-[clamp(2rem,4.5vw,3rem)] font-normal leading-[1.08] tracking-[-0.02em]">
            4 promesas, comprobables en 1 sesión
          </h2>

          <ul className="mt-12 grid gap-5 sm:grid-cols-2">
            {PROMISES.map((promise, i) => (
              <li
                key={promise.key}
                style={{ animationRange: `entry 0% entry ${55 + i * 10}%` }}
                className="reveal rounded-lg border border-line bg-surface p-7"
              >
                <h3 className="text-xl font-semibold tracking-[-0.01em]">{promise.title}</h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-muted">{promise.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* --------------------------------------------------------- Difference */}
      <section className="mx-auto max-w-[75rem] px-6 py-24 lg:py-28">
        <p className="reveal text-xs font-semibold uppercase tracking-[0.14em] text-accent">
          La diferencia
        </p>
        <h2 className="reveal mt-4 max-w-[26ch] font-serif text-[clamp(2rem,4.5vw,3rem)] font-normal leading-[1.08] tracking-[-0.02em]">
¿En qué se diferencia de preguntarle a ChatGPT?
        </h2>
        <p className="reveal mt-5 max-w-[58ch] text-[17px] leading-relaxed text-muted">
          Es la pregunta correcta, así que va contestada. 4 diferencias, todas comprobables en
          una sola sesión.
        </p>

        <ul className="mt-12 grid gap-4 lg:grid-cols-2">
          {DIFFERENCES.map((d, i) => (
            <li
              key={d.title}
              style={{ animationRange: `entry 0% entry ${55 + (i % 2) * 10}%` }}
              className="reveal overflow-hidden rounded-lg border border-line bg-surface transition duration-300 ease-out hover:-translate-y-1.5 hover:border-accent/35"
            >
              <h3 className="border-b border-line px-7 pb-4 pt-6 text-xl font-semibold tracking-[-0.01em]">
                {d.title}
              </h3>
              <div className="grid sm:grid-cols-2">
                <div className="border-line px-7 py-6 max-sm:border-b sm:border-r">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-soft">
                    Un asistente general
                  </p>
                  <p className="mt-2.5 text-[15px] leading-relaxed text-soft">{d.generic}</p>
                </div>
                <div className="bg-accent-soft/25 px-7 py-6">
                  <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold" />
                    ModoJIT
                  </p>
                  <p className="mt-2.5 text-[15px] leading-relaxed text-ink">{d.teacher}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
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
            <h2 className="reveal mt-4 font-serif text-[clamp(2rem,4.5vw,3rem)] font-normal leading-[1.08] tracking-[-0.02em]">
              15 minutos, caminando
            </h2>
          </div>

          <ol className="flex flex-col">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                style={{ animationRange: `entry 0% entry ${60 + i * 10}%` }}
                className={`reveal grid grid-cols-[3rem_1fr] gap-5 border-t border-line-strong py-6 ${
                  i === STEPS.length - 1 ? 'border-b' : ''
                }`}
              >
                <span aria-hidden className="pt-1 font-mono text-[13px] text-soft">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="text-xl font-semibold">{step.title}</h3>
                  <p className="mt-1.5 max-w-[52ch] text-base leading-relaxed text-muted">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ----------------------------------------------------------- CTA panel */}
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
              Empezar
              <span
                aria-hidden
                className="h-[7px] w-[7px] rounded-full bg-gold [animation:ring_2.2s_ease-out_infinite]"
              />
            </Link>
            <span className="text-sm text-bg/75">
              Se abre en el navegador · necesita micrófono · 20 minutos gratis
            </span>
          </div>
        </div>
      </section>
    </>
  );
}
