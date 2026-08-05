import Link from 'next/link';
import { SessionPreview } from '@/components/SessionPreview';
import { TOPICS, topicsFor } from '@/lib/topics';
import { COACHES, availableCoaches } from '@/lib/coaches';
import { CAPABILITIES, DIFFERENCES, PROFILE, PROOF, STEPS, hasContact } from '@/lib/site';

export const metadata = {
  title: 'ModoJIT · Coaches de voz para implementar IA, con fuente y fecha',
  description:
    'Tres coaches de voz, cada uno con su propia base de conocimiento: implementación de IA en empresas, en colegios, y para montar tu propio negocio. Normativa chilena con fechas, guías oficiales y evidencia con sus cifras.',
};

/** Two passes of the same list, so the marquee wraps without a visible seam. */
const MARQUEE = [...TOPICS, ...TOPICS];

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
            Aprendizaje justo a tiempo
          </p>

          <h1 className="mt-5 font-serif text-[clamp(2.75rem,7vw,4.75rem)] font-normal leading-[1.02] tracking-[-0.02em]">
            <span className="animate-rise block [animation-delay:140ms]">
              Aprende lo que necesitas,
            </span>
            <span className="animate-rise block text-accent [animation-delay:260ms]">
              {/*
                The highlight hugs one word rather than the line. A bar sized to
                the block runs past the text the moment the headline rewraps,
                which it does at every width between phone and desktop.
              */}
              <em className="relative inline-block italic">
                justo
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-1 -z-10 h-2 origin-left bg-gold-soft [animation:wipe_1s_var(--ease-out)_0.8s_both]"
                />
              </em>{' '}
              cuando lo necesitas
            </span>
          </h1>

          <p className="animate-rise mt-7 max-w-[48ch] text-[19px] leading-[1.58] text-body [animation-delay:400ms]">
            Coaches expertos por voz, cada uno con su propia base de conocimiento: implementar
            IA en tu empresa, en tu colegio, o montar tu propio negocio. Le cuentas dónde estás
            atascado y te responde con la norma, la guía o el estudio que aplica —con su fecha—
            y con un paso concreto para esta semana.
          </p>

          <div className="animate-rise mt-9 flex flex-wrap items-center gap-3.5 [animation-delay:520ms]">
            <Link
              href="/coach"
              className="inline-flex items-center gap-3 rounded-full bg-accent px-7 py-4 text-[17px] font-medium text-bg shadow-[0_10px_30px_-12px_rgba(20,38,63,0.6)] transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-[0_18px_40px_-14px_rgba(20,38,63,0.7)]"
            >
              Elige tu coach
              <span aria-hidden className="font-mono">
                →
              </span>
            </Link>
            <a
              href="#temas"
              className="inline-flex items-center rounded-full border border-line-strong bg-surface px-6 py-4 text-[17px] font-medium text-ink transition duration-200 ease-out hover:-translate-y-0.5 hover:border-accent"
            >
              Ver qué temas domina
            </a>
          </div>

          <p className="animate-fade mt-5 text-[13px] text-soft [animation-delay:900ms]">
            Se abre en el navegador · necesita micrófono · también puedes escribir
          </p>
        </div>

        <div className="animate-rise [animation-delay:340ms]">
          <div className="[animation:float_9s_ease-in-out_infinite]">
            <SessionPreview />
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- Capabilities */}
      <section id="que-hace" className="mx-auto max-w-[75rem] scroll-mt-24 px-6 pb-24 lg:pb-28">
        <p className="reveal text-xs font-semibold uppercase tracking-[0.14em] text-accent">
          Qué hace
        </p>
        <h2 className="reveal mt-4 max-w-[22ch] font-serif text-[clamp(2rem,4.5vw,3.25rem)] font-normal leading-[1.08] tracking-[-0.02em]">
          Un asesor experto, no una respuesta genérica
        </h2>

        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((c, i) => (
            <li
              key={c.title}
              style={{ animationRange: `entry 0% entry ${55 + i * 10}%` }}
              className="reveal rounded-lg border border-line bg-surface p-7 transition duration-300 ease-out hover:-translate-y-1.5 hover:border-accent/35 hover:shadow-md"
            >
              <span className="grid h-10 w-10 place-items-center rounded-md bg-accent-soft font-mono text-[15px] text-accent">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-6 text-xl font-semibold tracking-[-0.01em]">{c.title}</h3>
              <p className="mt-2.5 text-[15px] leading-relaxed text-muted">{c.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------- Difference */}
      <section
        id="diferencia"
        className="scroll-mt-24 border-y border-line bg-surface-alt py-24 lg:py-28"
      >
        <div className="mx-auto max-w-[75rem] px-6">
          <p className="reveal text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            La diferencia
          </p>
          <h2 className="reveal mt-4 max-w-[26ch] font-serif text-[clamp(2rem,4.5vw,3.25rem)] font-normal leading-[1.08] tracking-[-0.02em]">
            ¿Y esto en qué se diferencia de preguntarle a ChatGPT?
          </h2>
          <p className="reveal mt-5 max-w-[58ch] text-[17px] leading-relaxed text-muted">
            Es la pregunta correcta, así que va contestada. Cuatro diferencias, todas
            comprobables en una sola conversación —y abajo tienes tres preguntas para
            hacérselas a los dos y comparar.
          </p>

          <ul className="mt-12 grid gap-4 lg:grid-cols-2">
            {DIFFERENCES.map((d, i) => (
              <li
                key={d.title}
                style={{ animationRange: `entry 0% entry ${55 + (i % 2) * 10}%` }}
                className="reveal overflow-hidden rounded-lg border border-line bg-surface transition duration-300 ease-out hover:-translate-y-1.5 hover:border-accent/35 hover:shadow-md"
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
                      Este coach
                    </p>
                    <p className="mt-2.5 text-[15px] leading-relaxed text-ink">{d.coach}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <p className="reveal mt-10 max-w-[58ch] text-[15px] leading-relaxed text-muted">
            Lo que no va a hacer: sustituir a un asistente general. Para redactar, programar o
            resolver algo fuera de sus temas, usa el que ya pagas. Esto es para cuando estás
            atascado en algo de lo que sí tiene material.
          </p>

          {/*
            The comparison, offered as something to run rather than to believe.
            A page selling an AI product has no credibility left to spend on
            adjectives, so it hands over the test instead — including the row
            where a general assistant does fine.
          */}
          <div className="reveal mt-14 rounded-lg border border-line bg-surface p-6 sm:p-8">
            <h3 className="font-serif text-[26px] font-normal leading-tight tracking-[-0.01em]">
              No nos creas: pregúntale a los dos
            </h3>
            <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-muted">
              Tres preguntas donde la diferencia se ve en un solo intercambio. Hazlas en tu
              asistente de siempre y aquí, y compara con lo que debería salir.
            </p>

            <ul className="mt-7 space-y-3">
              {PROOF.map((p) => (
                <li
                  key={p.question}
                  className="grid gap-3 rounded-md border border-line bg-surface-alt/40 p-4 sm:grid-cols-[1.1fr_0.9fr] sm:p-5"
                >
                  <div>
                    {/* Where to ask it: the corpora are separate, so the wrong
                        coach correctly declines and the test looks broken. */}
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-soft">
                      {p.coach}
                    </p>
                    <p className="mt-1.5 text-[15px] font-medium leading-snug text-ink">
                      «{p.question}»
                    </p>
                    <p className="mt-2 text-[13px] leading-relaxed text-soft">
                      <span className="font-semibold">Un asistente general:</span> {p.generic}
                    </p>
                  </div>
                  <div className="border-line pt-3 sm:border-l sm:pl-5 sm:pt-0">
                    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold" />
                      Qué debería decirte
                    </p>
                    <p className="mt-2 text-[13px] leading-relaxed text-ink/85">{p.expect}</p>
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-6 text-[13px] leading-relaxed text-soft">
              Si alguna vez responde algo distinto de esto, el fallo es nuestro y queremos
              saberlo. Por eso las preguntas están publicadas y no escondidas.
            </p>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- Topics */}
      <section id="temas" className="scroll-mt-24 overflow-hidden pb-24 lg:pb-28">
        <div className="mx-auto max-w-[75rem] px-6">
          <p className="reveal text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            Los coaches
          </p>
          <h2 className="reveal mt-4 max-w-[24ch] font-serif text-[clamp(2rem,4.5vw,3.25rem)] font-normal leading-[1.08] tracking-[-0.02em]">
            Cada uno con su propio material
          </h2>
          <p className="mt-4 max-w-[56ch] text-[17px] leading-relaxed text-muted">
            No es el mismo asesor con distintas instrucciones: cada coach tiene su propia base
            de conocimiento y no puede consultar la de los otros. Si le preguntas algo de otro
            tema te lo dirá y no lo responderá. Y dentro del suyo, te avisa cuando responde sin
            material — lo que no puedes saber por ti mismo es si una respuesta viene de una
            fuente o de la nada.
          </p>
        </div>

        {/* Marquee: decorative motion over content that is also listed below. */}
        <div className="mt-10 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
          <ul
            aria-hidden
            className="flex w-max gap-3.5 pl-6 [animation:marquee_38s_linear_infinite]"
          >
            {MARQUEE.map((topic, i) => (
              <li
                key={`${topic.title}-${i}`}
                className="inline-flex items-center gap-2.5 whitespace-nowrap rounded-full border border-line-strong bg-surface px-5 py-3 text-base"
              >
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold" />
                {topic.title}
              </li>
            ))}
          </ul>
        </div>

        {/*
          Grouped by coach rather than one flat list. The grouping is the
          product now: which coach a topic sits under is what decides whether it
          can be asked at all, so a single ungrouped grid would misdescribe it.
        */}
        <div className="mx-auto mt-12 max-w-[75rem] space-y-14 px-6">
          {availableCoaches().map((coach) => (
            <div key={coach.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-line-strong pb-4">
                <div>
                  <h3 className="font-serif text-[clamp(1.4rem,2.6vw,1.85rem)] font-normal leading-tight tracking-[-0.01em]">
                    {coach.label}
                  </h3>
                  <p className="mt-1.5 max-w-[56ch] text-[15px] leading-relaxed text-muted">
                    {coach.blurb}
                  </p>
                </div>
                <Link
                  href={`/coach/${coach.id}`}
                  className="shrink-0 text-[15px] font-medium text-accent transition-colors duration-150 ease-out hover:text-accent-hover"
                >
                  Hablar con este coach <span aria-hidden>→</span>
                </Link>
              </div>

              <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {topicsFor(coach.id).map((topic, i) => (
                  <li
                    key={topic.title}
                    style={{ animationRange: `entry 0% entry ${55 + (i % 3) * 10}%` }}
                    className="reveal flex flex-col rounded-lg border border-line bg-surface p-6 transition duration-300 ease-out hover:-translate-y-1.5 hover:border-accent/35 hover:shadow-md"
                  >
                    <h4 className="text-base font-semibold tracking-[-0.01em]">
                      {topic.title}
                    </h4>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{topic.blurb}</p>
                    <p className="mt-auto border-t border-line pt-3 text-[13px] leading-relaxed text-soft">
                      <span className="font-medium text-ink">Por ejemplo:</span> «
                      {topic.examples[0]}»
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/*
            The coach that has no material yet, said plainly rather than left
            off. Announcing a gap costs nothing; letting somebody discover it
            after picking would cost their session.
          */}
          {COACHES.filter((c) => !c.available).map((coach) => (
            <div
              key={coach.id}
              className="rounded-lg border border-dashed border-line bg-surface-alt/40 p-6"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-soft">
                {coach.tag}
              </span>
              <h3 className="mt-2 font-serif text-[1.4rem] font-normal leading-tight text-muted">
                {coach.label}
              </h3>
              <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-muted">
                {coach.blurb} {coach.outOfScopeNote}
              </p>
            </div>
          ))}
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
            <h2 className="reveal mt-4 font-serif text-[clamp(2rem,4.5vw,3rem)] font-normal leading-[1.08] tracking-[-0.02em]">
              De atascado a desbloqueado, en una conversación
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

      {/* ------------------------------------------------------------- Contact */}
      {hasContact && (
        <section
          id="contacto"
          className="mx-auto max-w-[75rem] scroll-mt-24 px-6 pb-24 pt-24 lg:pb-28"
        >
          <div className="grid gap-10 lg:grid-cols-[1fr_26rem] lg:gap-16">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                Contacto
              </p>
              <h2 className="mt-4 font-serif text-[clamp(2rem,4.5vw,3.25rem)] font-normal leading-[1.08] tracking-[-0.02em]">
                Hablemos
              </h2>
              <p className="mt-4 max-w-prose text-[17px] leading-relaxed text-muted">
                ¿Quieres un coach como este con el material de tu equipo, o comentar si encaja
                en lo que estás montando? Escríbeme o agenda una llamada.
              </p>
            </div>

            <div className="rounded-lg border border-line bg-surface p-7 shadow-sm">
              <div className="flex flex-wrap gap-3">
                {PROFILE.bookingUrl && (
                  <a
                    href={PROFILE.bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2.5 rounded-full bg-accent px-6 py-3 text-[15px] font-medium text-bg transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-hover"
                  >
                    Agendar una llamada
                    <span aria-hidden className="font-mono">
                      →
                    </span>
                  </a>
                )}
                {PROFILE.email && (
                  <a
                    href={`mailto:${PROFILE.email}`}
                    className="rounded-full border border-line-strong bg-surface px-6 py-3 text-[15px] font-medium text-ink transition duration-200 ease-out hover:-translate-y-0.5 hover:border-accent"
                  >
                    Escribir un correo
                  </a>
                )}
              </div>

              <dl className="mt-6 space-y-2.5 border-t border-line pt-5 text-sm">
                {PROFILE.email && (
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-medium">Correo</dt>
                    <dd>
                      <a
                        href={`mailto:${PROFILE.email}`}
                        className="rounded-sm text-accent underline underline-offset-2 hover:text-accent-hover"
                      >
                        {PROFILE.email}
                      </a>
                    </dd>
                  </div>
                )}
                {PROFILE.linkedin && (
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-medium">LinkedIn</dt>
                    <dd>
                      <a
                        href={PROFILE.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-sm text-accent underline underline-offset-2 hover:text-accent-hover"
                      >
                        {PROFILE.linkedin.replace(/^https?:\/\//, '')}
                      </a>
                    </dd>
                  </div>
                )}
                {PROFILE.website && (
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-medium">Web</dt>
                    <dd>
                      <a
                        href={PROFILE.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-sm text-accent underline underline-offset-2 hover:text-accent-hover"
                      >
                        {PROFILE.website.replace(/^https?:\/\//, '')}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </section>
      )}

      {/* ----------------------------------------------------------- CTA panel */}
      <section className="mx-auto max-w-[75rem] px-6 py-24 lg:py-28">
        <div className="reveal relative overflow-hidden rounded-xl bg-accent-hover px-8 py-16 sm:px-16 sm:py-18">
          <div
            aria-hidden
            className="absolute -right-[10%] -top-[40%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(217,168,59,0.28),transparent_65%)] [animation:float_12s_ease-in-out_infinite]"
          />
          <p className="relative text-xs font-semibold uppercase tracking-[0.14em] text-gold-light">
            Empieza por lo que te bloquea hoy
          </p>
          <h2 className="relative mt-5 max-w-[20ch] font-serif text-[clamp(2.25rem,5vw,3.75rem)] font-normal leading-[1.04] tracking-[-0.02em] text-bg">
            ¿Qué estás intentando resolver ahora mismo?
          </h2>
          <div className="relative mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/coach"
              className="inline-flex items-center gap-3 rounded-full bg-bg px-7 py-4 text-[17px] font-semibold text-accent-deep transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-surface"
            >
              Elige tu coach
              <span aria-hidden className="font-mono">
                →
              </span>
            </Link>
            <span className="text-sm text-bg/75">
              Se abre en el navegador · necesita micrófono
            </span>
          </div>
        </div>
      </section>
    </>
  );
}
