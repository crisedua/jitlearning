import Link from 'next/link';
import { TOPICS } from '@/lib/topics';
import { CAPABILITIES, PROFILE, STEPS, hasContact } from '@/lib/site';

export const metadata = {
  title: 'Aprendizaje JIT · Un coach que responde a lo que te bloquea ahora',
  description:
    'Coach de voz de aprendizaje justo a tiempo: responde la pregunta que te tiene atascado, apoyado en material real, y te lo enseña paso a paso en pantalla.',
};

/** Small line-art icons. Inline so the page makes no external requests. */
function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    bolt: <path d="m13 2-8 11h6l-2 9 8-11h-6l2-9Z" />,
    book: (
      <>
        <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v15H6.5A2.5 2.5 0 0 0 4 19.5Z" />
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20v5H6.5A2.5 2.5 0 0 1 4 19.5Z" />
      </>
    ),
    screen: (
      <>
        <rect x="2.5" y="4" width="19" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      {paths[name]}
    </svg>
  );
}

export default function HomePage() {
  return (
    <div className="space-y-20 sm:space-y-28">
      {/* ---------------------------------------------------------------- Hero */}
      <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-accent">
            Aprendizaje justo a tiempo
          </p>
          <h1 className="mt-3 text-4xl font-semibold leading-[1.1] tracking-[-0.025em] sm:text-5xl xl:text-6xl">
            Aprende lo que necesitas,{' '}
            <span className="text-accent">justo cuando lo necesitas</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Un coach de voz al que le cuentas en qué estás atascado y te desbloquea. Sin
            temario, sin buscar en diez pestañas, y sin inventarse lo que no sabe.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/coach"
              className="inline-flex items-center gap-2 rounded-md bg-accent px-6 py-3 text-[15px] font-semibold text-white shadow-sm transition duration-150 ease-out hover:-translate-y-px hover:bg-accent-hover hover:shadow-md"
            >
              Hablar con el coach
              <span aria-hidden>→</span>
            </Link>
            <a
              href="#temas"
              className="rounded-md border border-line bg-surface px-5 py-3 text-[15px] font-semibold text-ink shadow-sm transition duration-150 ease-out hover:border-line-strong hover:shadow-md"
            >
              Ver de qué sabe
            </a>
          </div>

          <p className="mt-4 text-sm text-muted">
            Se abre en el navegador · necesita micrófono · también puedes escribir
          </p>
        </div>

        {/* A sample exchange rather than a stock photo: it shows the tone of the
            thing being sold, which a screenshot of a waveform would not. */}
        <div className="relative">
          <div
            aria-hidden
            className="absolute -inset-4 -z-10 rounded-lg bg-gradient-to-br from-accent-soft via-surface-alt to-transparent opacity-70 blur-2xl"
          />
          <div className="space-y-3 rounded-lg border border-line bg-surface p-5 shadow-lg sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              Así suena una sesión
            </p>
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-lg bg-accent px-4 py-2.5 text-sm leading-relaxed text-white">
                Tengo una idea de negocio pero no sé si alguien pagaría por ella.
              </p>
            </div>
            <div className="flex justify-start">
              <p className="max-w-[90%] rounded-lg border border-line bg-surface-alt/70 px-4 py-2.5 text-sm leading-relaxed text-ink">
                Entonces todavía no toca construir nada. Busca tres personas que te paguen
                en cuarenta y ocho horas. ¿A quién podrías escribirle hoy mismo?
              </p>
            </div>
            <p className="pt-1 text-xs leading-relaxed text-muted">
              Respuesta fundamentada en la regla de validación de Noah Kagan, que está en
              la base de conocimiento.
            </p>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- Capabilities */}
      <section id="que-hace" className="scroll-mt-24">
        <header className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-accent">
            Qué hace
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
            Un colega con experiencia, no un buscador
          </h2>
        </header>

        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((c) => (
            <li
              key={c.title}
              className="rounded-lg border border-line bg-surface p-6 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-accent-soft text-accent">
                <Icon name={c.icon} />
              </span>
              <h3 className="mt-4 text-lg font-semibold tracking-tight">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{c.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* -------------------------------------------------------------- Topics */}
      <section id="temas" className="scroll-mt-24">
        <header className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-accent">
            Áreas de conocimiento
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
            De esto tiene material propio
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Fuera de estas áreas te avisará de que responde de conocimiento general. Es
            deliberado: lo que no puedes saber por ti mismo es si una respuesta viene de
            una fuente o de la nada.
          </p>
        </header>

        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TOPICS.map((topic) => (
            <li
              key={topic.title}
              className="flex flex-col rounded-lg border border-line bg-surface p-6 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md"
            >
              <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold tracking-tight">
                {topic.title}
                {topic.illustrated && (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-accent-hover">
                    con pantalla
                  </span>
                )}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{topic.blurb}</p>
              <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-muted">
                <span className="font-medium text-ink">Por ejemplo:</span> «
                {topic.examples[0]}»
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* --------------------------------------------------------------- Steps */}
      <section className="rounded-lg border border-line bg-surface-alt/50 px-6 py-10 sm:px-10 sm:py-12">
        <header className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-accent">
            Cómo funciona
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
            Tres minutos, no tres horas
          </h2>
        </header>

        <ol className="mt-8 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <span
                aria-hidden
                className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-white shadow-sm"
              >
                {i + 1}
              </span>
              <h3 className="mt-3 text-base font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------------------------------------------- Contact */}
      {hasContact && (
        <section id="contacto" className="scroll-mt-24">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16">
            <header>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-accent">
                Contacto
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
                Hablemos
              </h2>
              <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-muted">
                ¿Quieres un coach como este con el material de tu equipo, o comentar si
                encaja en lo que estás montando? Escríbeme o agenda una llamada.
              </p>
            </header>

            <div>
              <div className="rounded-lg border border-line bg-surface p-6 shadow-sm sm:p-8">

                <div className="mt-6 flex flex-wrap gap-3">
                  {PROFILE.bookingUrl && (
                    <a
                      href={PROFILE.bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition duration-150 ease-out hover:-translate-y-px hover:bg-accent-hover hover:shadow-md"
                    >
                      Agendar una llamada
                      <span aria-hidden>→</span>
                    </a>
                  )}
                  {PROFILE.email && (
                    <a
                      href={`mailto:${PROFILE.email}`}
                      className="rounded-md border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-ink shadow-sm transition duration-150 ease-out hover:border-line-strong hover:shadow-md"
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
          </div>
        </section>
      )}

      {/* ----------------------------------------------------------- CTA strip */}
      <section className="flex flex-wrap items-center justify-between gap-6 rounded-lg border border-line bg-surface px-6 py-8 shadow-sm sm:px-10 sm:py-10">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">
            ¿En qué estás atascado ahora mismo?
          </h2>
          <p className="mt-2 text-[15px] text-muted">
            Pruébalo con eso exactamente. Es para lo que sirve.
          </p>
        </div>
        <Link
          href="/coach"
          className="inline-flex items-center gap-2 rounded-md bg-accent px-6 py-3 text-[15px] font-semibold text-white shadow-sm transition duration-150 ease-out hover:-translate-y-px hover:bg-accent-hover hover:shadow-md"
        >
          Empezar ahora
          <span aria-hidden>→</span>
        </Link>
      </section>
    </div>
  );
}
