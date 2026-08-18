/**
 * What this deployment is actually missing, readable in a browser.
 *
 * `/api/health` answers the same question and cannot be reached: every
 * privileged route is gated by `INGEST_SECRET`, and a deployment without it
 * returns 503 to the very call that would have told you something is wrong. The
 * diagnostic needs the thing being diagnosed.
 *
 * This page needs no shared secret. It is gated on being signed in as an admin,
 * which the person who deployed this already is, so the migration state of the
 * live database is visible from a phone without a terminal, a curl, or a value
 * that has to be generated and pasted into Vercel first.
 *
 * ## Why it exists at all
 *
 * `npm run sql` emits nine files to paste into a web editor in one go. Half of
 * them applying is the realistic failure, not the exotic one, and every read in
 * this app is written to survive it quietly: a missing column returns 42703,
 * gets swallowed by design so a learner mid-question is never shown an error,
 * and the feature silently stops existing. That is the right behaviour for a
 * conversation and it means nothing anywhere says which half is missing.
 *
 * Each row says what stops working rather than which column is absent, because
 * that is the sentence somebody can act on.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { checkAdmin } from '@/lib/admin';
import { signInPath } from '@/lib/paths';
import { NotAdmin } from '@/components/NotAdmin';
import { MIGRATION_SENSITIVE } from '@/lib/schema';
import { firstMissingRung } from '@/lib/setup';
import { deliveryReport } from '@/lib/delivery';
import { parity } from '@/lib/parity';
import { serviceConfigured, supabaseAdmin } from '@/lib/supabase/admin';
import { getAgent } from '@/lib/elevenlabs';
import { agentId } from '@/lib/config';
import {
  dataCollection,
  dynamicVariablePlaceholders,
  evaluationCriteria,
  FIRST_MESSAGE,
  ragConfig,
  teacherSystemPrompt,
} from '@/lib/agent';
import { ownsDocument } from '@/lib/teacher';
import { withDeadline } from '@/lib/deadline';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Estado · ModoJIT',
  robots: { index: false, follow: false },
};

interface Row {
  table: string;
  column: string;
  why: string;
  ok: boolean;
  code: string | null;
}

async function probe(): Promise<Row[] | null> {
  if (!serviceConfigured()) return null;

  return Promise.all(
    MIGRATION_SENSITIVE.map(async ({ table, column, why }) => {
      const { error } = await supabaseAdmin()
        .from(table)
        .select(column, { count: 'exact', head: true });
      return { table, column, why, ok: !error, code: error?.code ?? null };
    }),
  );
}

/**
 * Environment that changes what the product can do, without revealing values.
 *
 * Every variable the app reads, not a selection of them. It listed five, and
 * said "todas puestas" when those five were set — on a page that could be
 * saying "falta SUPABASE_SERVICE_ROLE_KEY" two sections above and "falta
 * ELEVENLABS_AGENT_ID" one section below, at the same time, on the same screen.
 *
 * A green line about a subset, presented as a green line about everything, is
 * the failure this page exists to catch, appearing on the page itself.
 */
function environment(): { label: string; set: boolean; missing: string }[] {
  return [
    {
      label: 'ELEVENLABS_API_KEY',
      set: Boolean(process.env.ELEVENLABS_API_KEY?.trim()),
      missing: 'No hay profesor: nadie puede tener una clase.',
    },
    {
      label: 'ELEVENLABS_AGENT_ID',
      set: Boolean(process.env.ELEVENLABS_AGENT_ID?.trim()),
      missing: 'No hay profesor: nadie puede tener una clase.',
    },
    {
      label: 'NEXT_PUBLIC_SUPABASE_URL',
      set: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()),
      missing: 'Nadie puede entrar, así que /coach es inalcanzable.',
    },
    {
      label: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      set: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()),
      missing: 'Nadie puede entrar, así que /coach es inalcanzable.',
    },
    {
      label: 'SUPABASE_SERVICE_ROLE_KEY',
      set: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
      missing: 'Las clases funcionan y no queda nada anotado: sin memoria, sin plan, sin cobro.',
    },
    {
      label: 'NEXT_PUBLIC_SITE_URL',
      set: Boolean(
        process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.PUBLIC_BASE_URL?.trim(),
      ),
      missing:
        'El alias .vercel.app sigue siendo una segunda puerta, y entrar por ahí puede romper el login.',
    },
    {
      label: 'INGEST_SECRET',
      set: Boolean(process.env.INGEST_SECRET?.trim()),
      missing: '/api/health, /api/billing/setup y la herramienta de búsqueda responden 503.',
    },
    {
      label: 'STRIPE_SECRET_KEY',
      set: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
      missing: 'Los planes de pago muestran "Conversemos" en vez de un checkout.',
    },
    {
      label: 'STRIPE_WEBHOOK_SECRET',
      set: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
      missing: 'Un pago se cobra y no activa ningún plan.',
    },
    {
      label: 'ELEVENLABS_WEBHOOK_SECRET',
      set: Boolean(process.env.ELEVENLABS_WEBHOOK_SECRET?.trim()),
      missing: 'Nada de lo que se habla queda anotado: sin plan, sin medición, sin oferta.',
    },
    {
      label: 'ANTHROPIC_API_KEY',
      set: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
      missing: 'El profesor dice en voz alta que no puede buscar. La clase sigue.',
    },
  ];
}

/**
 * Which of the gaps to close first, worded for whoever runs this.
 *
 * The order lives in `setup.ts`, shared with the doctor, because this page and
 * that script both answer the same question and had a copy of the ladder each,
 * written days apart. The wording stays here: an operator reading their own
 * product in Spanish and somebody reading a terminal in English want different
 * sentences, and flattening that into one string would serve neither.
 */
const STEP_COPY: Record<string, { do: string; then: string }> = {
  signin: {
    do: 'Pon NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en Vercel.',
    then: 'Hasta que estén, nadie puede entrar, y nada de lo de abajo es alcanzable.',
  },
  teacher: {
    do: 'Pon ELEVENLABS_API_KEY y ELEVENLABS_AGENT_ID en Vercel.',
    then: 'La gente puede entrar y no hay profesor con quien hablar.',
  },
  recording: {
    do: 'Pon SUPABASE_SERVICE_ROLE_KEY y pega las migraciones: `npm run sql | pbcopy`.',
    then: 'Las clases pasan y no queda nada anotado.',
  },
  memory: {
    do: 'Pon ELEVENLABS_WEBHOOK_SECRET y registra el webhook post_call_transcription.',
    then: 'Cada clase se olvida, así que quien vuelva es tratado como desconocido.',
  },
  search: {
    do: 'Pon INGEST_SECRET y corre `npm run setup:tools -- --push`.',
    then: 'El profesor enseña; simplemente no puede buscar nada, y ya lo dice.',
  },
  money: {
    do: 'Pon las llaves de Stripe y llama a /api/billing/setup.',
    then: 'Todo enseña. Nadie puede pagar sin que tú lo hagas a mano.',
  },
};

function firstStep(env: ReturnType<typeof environment>): { do: string; then: string } | null {
  const rung = firstMissingRung((name) => env.some((e) => e.label === name && e.set));
  return rung ? (STEP_COPY[rung.id] ?? null) : null;
}


/**
 * The live agent, checked from inside the deployment.
 *
 * `npm run doctor` asks these questions of whatever `.env.local` points at.
 * This page asks them of the agent that learners are actually talking to, using
 * the key this deployment holds, which is the only place the answer is true.
 *
 * Every one of these fails silently. A persona a push behind is a teacher
 * running old instructions while the repo looks right; a blanked first message
 * is a session that opens on a greeting instead of on the learner's own record;
 * a document from a retired corpus is a confident answer about a subject nobody
 * maintains.
 */
/**
 * How long this page will wait for ElevenLabs before rendering without it.
 *
 * Four seconds, which is longer than the two and a half the mint allows: a
 * learner is looking at a button they pressed, an operator is reading a report.
 * Past it the section says it could not check rather than leaving the page
 * hanging, because a diagnostic that does not load is worse than one that
 * reports a gap — and what is making it hang is quite possibly what they came
 * to diagnose.
 */
const AGENT_DEADLINE_MS = 4_000;

type AgentRow = { label: string; ok: boolean; detail: string };

/**
 * Whether the post-call webhook is actually landing, asked of the data.
 *
 * Everything else on this page checks configuration, and configuration is not
 * what fails here. The secret can be set in both places and the webhook still
 * never arrive: registered against the wrong URL, pointed at a preview
 * deployment, switched off, or subscribed to the wrong event. All of those look
 * identical from inside the app, and all of them produce silence.
 *
 * The silence is not merely lost data. `buildRecord` correctly treats a learner
 * with no history as new, so a returning learner is diagnosed from scratch every
 * time, and what /planes sells as memory between sessions simply does not
 * happen. The learner does not conclude that a webhook is misconfigured. They
 * conclude it does not remember them.
 *
 * A finished conversation with no summary is that failure on the record.
 */
async function delivery(): Promise<AgentRow | null> {
  const report = await deliveryReport();
  if (!report) return null;

  const label = 'La memoria entre clases';
  if (report.unreadable) {
    return {
      label,
      ok: false,
      detail: 'No se pudo leer las conversaciones, así que no se puede confirmar que llegue nada.',
    };
  }
  if (report.settled === 0) {
    return {
      label,
      ok: true,
      detail: 'Todavía no termina ninguna conversación, así que esto no prueba nada aún.',
    };
  }
  if (report.missing === 0) {
    return {
      label,
      ok: true,
      detail: `${report.settled} conversación(es) terminadas y todas dejaron resumen.`,
    };
  }
  return {
    label,
    ok: false,
    detail:
      `${report.missing} de ${report.settled} conversaciones terminaron sin resumen. ` +
      'Quien vuelva va a ser tratado como desconocido. Revisa que el webhook ' +
      'post_call_transcription apunte a esta instalación en el panel de ElevenLabs.',
  };
}

async function agentState(): Promise<AgentRow[] | null> {
  const id = agentId();
  if (!id || !process.env.ELEVENLABS_API_KEY?.trim()) return null;

  return withDeadline(readAgent(id), [TIMED_OUT], AGENT_DEADLINE_MS);
}

const TIMED_OUT: AgentRow = {
  label: 'El agente',
  ok: false,
  detail: 'ElevenLabs no respondió a tiempo. Vuelve a cargar: el resto de esta página es válido.',
};

async function readAgent(id: string): Promise<AgentRow[]> {
  try {
    const agent = await getAgent(id);
    const prompt = agent.conversation_config?.agent?.prompt;
    const attached = prompt?.knowledge_base ?? [];
    const foreign = attached.filter((d) => !ownsDocument(d.name));
    const live = (prompt?.prompt ?? '').trim();
    // One comparison, shared with the doctor. See `parity.ts`.
    const check = parity({
      prompt,
      dynamicVariables: agent.conversation_config?.agent?.dynamic_variables
        ?.dynamic_variable_placeholders,
      platform_settings: (agent as unknown as { platform_settings?: never }).platform_settings,
    });

    // Which persona this agent should be running, from what it actually carries.
    const hasTool = (prompt?.tool_ids ?? []).length > 0;
    const wantRag = ragConfig();

    return [
      {
        label: 'La persona que está corriendo',
        /*
         * One comparison, shared with the doctor. See `parity.ts`. Both
         * mismatches are named separately because the fix reads differently by
         * direction, and the quiet one — a tool attached and a persona that
         * declines to use it — errors nowhere and is taught to everybody.
         */
        ok: check.persona === 'match',
        detail:
          check.persona === 'match'
            ? check.hasTool
              ? 'Es la de este repo, carácter por carácter.'
              : 'Es la de este repo, sin la promesa de buscar, porque no hay herramienta conectada.'
            : check.persona === 'under-promises'
              ? 'Hay herramienta de búsqueda y la persona dice que no puede buscar. Corre `npm run sync:agent -- --push`.'
              : check.persona === 'over-promises'
                ? 'La persona promete buscar y no hay herramienta conectada. Corre `npm run sync:agent -- --push`.'
                : check.persona === 'empty'
                  ? 'El agente no tiene prompt. Corre `npm run sync:agent -- --push`.'
                  : 'El agente tiene una versión distinta. Corre `npm run sync:agent -- --push`.',
      },
      {
        label: 'La primera frase',
        ok: (agent.conversation_config?.agent?.first_message ?? '').trim() === FIRST_MESSAGE,
        detail:
          (agent.conversation_config?.agent?.first_message ?? '').trim() === FIRST_MESSAGE
            ? 'Abre con lo que sabe de la persona, no con un saludo fijo.'
            : 'Abre con un texto fijo: nadie oye su propio compromiso al empezar.',
      },
      {
        label: 'El material adjunto',
        ok: foreign.length === 0,
        detail:
          foreign.length === 0
            ? `${attached.length} documento(s), todos del corpus vivo.`
            : `${foreign.length} documento(s) de un corpus retirado: ${foreign.map((d) => d.name).join(', ')}.`,
      },
      /*
       * The three things that vanish without a sound.
       *
       * All of them are pushed by `sync:agent` and all of them can be edited off
       * the agent in the ElevenLabs dashboard, which is how the persona drifted
       * before parity was checked. The doctor asks these already; this page is
       * where they belong, because it runs against the agent an operator is
       * actually using and needs no key on anybody's laptop.
       */
      {
        label: 'Las variables de la conversación',
        ok: check.missingVariables.length === 0,
        detail:
          check.missingVariables.length === 0
            ? 'Todas declaradas. Una conversación que no las mande igual arranca.'
            : `Faltan ${check.missingVariables.join(', ')}. Sin esos valores por defecto, una conversación que no los mande falla entera y se ve como un error de conexión. Corre \`npm run sync:agent -- --push\`.`,
      },
      {
        label: 'Lo que se extrae de cada clase',
        ok: check.missingFields.length === 0,
        detail:
          check.missingFields.length === 0
            ? `Los ${Object.keys(dataCollection()).length} campos están en el agente.`
            : `Faltan ${check.missingFields.length}: ${check.missingFields.join(', ')}. El webhook los lee, no encuentra nada y guarda null, con un 200 en los dos extremos. Corre \`npm run sync:agent -- --push\`.`,
      },
      {
        label: 'Con qué se califica cada clase',
        ok: check.missingCriteria.length === 0,
        detail:
          check.missingCriteria.length === 0
            ? `Los ${evaluationCriteria().length} criterios están puestos, así que cada conversación vuelve marcada.`
            : `Faltan ${check.missingCriteria.length}: ${check.missingCriteria.join(', ')}. Sin ellos toda clase vuelve como "success" sin que nadie haya preguntado qué logró. Corre \`npm run sync:agent -- --push\`.`,
      },
      {
        label: 'La búsqueda en el material',
        ok:
          Boolean(prompt?.rag?.enabled) &&
          prompt?.rag?.embedding_model === wantRag.embedding_model &&
          prompt?.rag?.max_vector_distance === wantRag.max_vector_distance,
        detail: !prompt?.rag?.enabled
          ? 'Apagada, así que el material adjunto no se consulta nunca. Corre `npm run sync:agent -- --push`.'
          : prompt?.rag?.embedding_model !== wantRag.embedding_model ||
              prompt?.rag?.max_vector_distance !== wantRag.max_vector_distance
            ? `Configurada distinto a este repo: modelo ${prompt?.rag?.embedding_model ?? 'sin definir'} y umbral ${prompt?.rag?.max_vector_distance ?? 'sin definir'}, contra ${wantRag.embedding_model} y ${wantRag.max_vector_distance}. Muy estrecho, o un modelo con el que los documentos no se indexaron, no recupera nada: el profesor responde de conocimiento general, lo dice, y suena bien igual. Corre \`npm run sync:agent -- --push\`.`
            : `Encendida, con ${wantRag.embedding_model} y umbral ${wantRag.max_vector_distance}.`,
      },
      {
        label: 'La herramienta de búsqueda',
        ok: (prompt?.tool_ids ?? []).length > 0,
        detail:
          (prompt?.tool_ids ?? []).length > 0
            ? 'Adjunta. El profesor puede buscar lo que promete buscar.'
            : 'Sin adjuntar, así que el profesor avisa que no puede buscar. Corre `npm run setup:tools -- --push` para que sí pueda.',
      },
    ];
  } catch (err) {
    return [
      {
        label: 'El agente',
        ok: false,
        detail: `No se pudo leer: ${err instanceof Error ? err.message : 'error desconocido'}`,
      },
    ];
  }
}

export default async function EstadoPage() {
  const gate = await checkAdmin();
  if (!gate.ok) {
    if (gate.reason === 'anonymous') redirect(signInPath('/admin/estado'));
    // Signed in as somebody else. Say so rather than bouncing them to the
    // marketing page, which is indistinguishable from the page being broken.
    return <NotAdmin email={gate.email} path="/admin/estado" />;
  }

  const [rows, agent, memory] = await Promise.all([probe(), agentState(), delivery()]);
  const env = environment();
  const next = firstStep(env);
  const brokenRows = rows?.filter((r) => !r.ok) ?? [];
  const missingEnv = env.filter((e) => !e.set);

  return (
    <section className="mx-auto max-w-[70rem] px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Operación</p>
      <h1 className="mt-4 max-w-[24ch] font-serif text-[clamp(2rem,4.5vw,3rem)] font-normal leading-[1.06] tracking-[-0.02em]">
        Qué le falta a este despliegue
      </h1>
      <p className="mt-5 max-w-[64ch] text-[17px] leading-relaxed text-muted">
        Leído desde adentro del despliegue, que es el único lugar donde la respuesta es cierta. Todo
        lo que falta acá se apaga en silencio: nadie ve un error, la función simplemente deja de
        existir.
      </p>

      {/* One thing, because a list of ten is not a plan. See `firstStep`. */}
      {next && (
        <section className="mt-8 rounded-lg border border-accent/40 bg-accent-soft/25 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">
            Empieza por acá
          </p>
          <p className="mt-1.5 text-[16px] font-medium leading-relaxed text-ink">{next.do}</p>
          <p className="mt-1 text-[14px] leading-relaxed text-muted">{next.then}</p>
        </section>
      )}

      <h2 className="mt-12 font-serif text-[22px] font-normal">Base de datos</h2>
      {rows === null ? (
        <p className="mt-4 rounded-lg border border-warning/35 bg-warning-soft/50 px-4 py-3 text-[15px] leading-relaxed text-ink/80">
          Falta <code className="font-mono text-[13px]">SUPABASE_SERVICE_ROLE_KEY</code>, así que no
          hay nada que revisar. Sin eso no se guarda ninguna sesión.
        </p>
      ) : brokenRows.length === 0 ? (
        <p className="mt-4 rounded-lg border border-success/30 bg-success-soft/40 px-5 py-4 text-[15px] leading-relaxed text-ink/85">
          Las {rows.length} columnas que importan están. Las migraciones se corrieron completas.
        </p>
      ) : (
        <>
          <p className="mt-4 rounded-lg border border-danger/30 bg-danger-soft/50 px-5 py-4 text-[15px] leading-relaxed text-ink/85">
            Falta correr <code className="font-mono text-[13px]">npm run sql</code> entero en el
            editor SQL de Supabase. Hasta entonces:
          </p>
          <ul className="mt-4 space-y-2">
            {brokenRows.map((r) => (
              <li
                key={`${r.table}.${r.column}`}
                className="rounded-lg border border-danger/25 bg-surface px-5 py-3.5"
              >
                <p className="text-[15px] leading-relaxed text-ink/85">{r.why}</p>
                <p className="mt-1 font-mono text-[12px] text-soft">
                  {r.table}.{r.column} · {r.code}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mt-12 font-serif text-[22px] font-normal">El profesor</h2>
      {agent === null ? (
        <p className="mt-4 rounded-lg border border-warning/35 bg-warning-soft/50 px-4 py-3 text-[15px] leading-relaxed text-ink/80">
          Falta <code className="font-mono text-[13px]">ELEVENLABS_AGENT_ID</code> o{' '}
          <code className="font-mono text-[13px]">ELEVENLABS_API_KEY</code>, así que no hay agente
          que revisar. Sin eso no hay clase.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {agent.map((row) => (
            <li
              key={row.label}
              className={`rounded-lg border px-5 py-3.5 ${
                row.ok ? 'border-line bg-surface' : 'border-danger/25 bg-surface'
              }`}
            >
              <p className="text-[15px] font-medium">
                {row.ok ? '' : '· '}
                {row.label}
              </p>
              <p className="mt-1 text-[15px] leading-relaxed text-muted">{row.detail}</p>
            </li>
          ))}
        </ul>
      )}

      {/*
        Outside the agent list on purpose: this one needs the service key rather
        than the ElevenLabs key, so it is still answerable on a deployment where
        the block above says there is no agent to inspect.
      */}
      {memory && (
        <ul className="mt-2 space-y-2">
          <li
            className={`rounded-lg border px-5 py-3.5 ${
              memory.ok ? 'border-line bg-surface' : 'border-danger/25 bg-surface'
            }`}
          >
            <p className="text-[15px] font-medium">
              {memory.ok ? '' : '· '}
              {memory.label}
            </p>
            <p className="mt-1 text-[15px] leading-relaxed text-muted">{memory.detail}</p>
          </li>
        </ul>
      )}

      <h2 className="mt-12 font-serif text-[22px] font-normal">Variables de entorno</h2>
      {missingEnv.length === 0 ? (
        <p className="mt-4 rounded-lg border border-success/30 bg-success-soft/40 px-5 py-4 text-[15px] leading-relaxed text-ink/85">
          Todas puestas.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {missingEnv.map((e) => (
            <li key={e.label} className="rounded-lg border border-warning/30 bg-surface px-5 py-3.5">
              <p className="font-mono text-[13px] text-ink">{e.label}</p>
              <p className="mt-1 text-[15px] leading-relaxed text-muted">{e.missing}</p>
            </li>
          ))}
        </ul>
      )}

      {/*
        Never the values, only whether they are there. This page is behind an
        identity check rather than a secret, which is the right trade for a
        diagnostic and the wrong one for anything that prints key material.
      */}
      <p className="mt-14 max-w-[75ch] border-t border-line pt-6 text-[13px] leading-relaxed text-soft">
        Esta página no muestra ningún valor, solo si está puesto o no. Lo que hizo la gente está en{' '}
        <Link href="/admin/embudo" className="text-accent underline underline-offset-2">
          /admin/embudo
        </Link>
        , y lo que escribieron en{' '}
        <Link href="/admin/feedback" className="text-accent underline underline-offset-2">
          /admin/feedback
        </Link>
        .
      </p>
    </section>
  );
}
