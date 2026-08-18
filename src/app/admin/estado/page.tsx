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
import { serviceConfigured, supabaseAdmin } from '@/lib/supabase/admin';
import { getAgent } from '@/lib/elevenlabs';
import { agentId } from '@/lib/config';
import { FIRST_MESSAGE, teacherSystemPrompt } from '@/lib/agent';
import { ownsDocument } from '@/lib/teacher';

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

/** Environment that changes what the product can do, without revealing values. */
function environment(): { label: string; set: boolean; missing: string }[] {
  return [
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
async function agentState(): Promise<{ label: string; ok: boolean; detail: string }[] | null> {
  const id = agentId();
  if (!id || !process.env.ELEVENLABS_API_KEY?.trim()) return null;

  try {
    const agent = await getAgent(id);
    const prompt = agent.conversation_config?.agent?.prompt;
    const attached = prompt?.knowledge_base ?? [];
    const foreign = attached.filter((d) => !ownsDocument(d.name));
    const live = (prompt?.prompt ?? '').trim();

    return [
      {
        label: 'La persona que está corriendo',
        ok: live === teacherSystemPrompt().trim(),
        detail:
          live === teacherSystemPrompt().trim()
            ? 'Es la de este repo, carácter por carácter.'
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
      {
        label: 'La herramienta de búsqueda',
        ok: (prompt?.tool_ids ?? []).length > 0,
        detail:
          (prompt?.tool_ids ?? []).length > 0
            ? 'Adjunta. El profesor puede buscar lo que promete buscar.'
            : 'Sin adjuntar, y la persona dice que puede buscar. Corre `npm run setup:tools -- --push`.',
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

  const [rows, agent] = await Promise.all([probe(), agentState()]);
  const env = environment();
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
