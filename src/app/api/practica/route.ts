/**
 * The practice bench's one endpoint: a learner's message to Gemini, Claude or
 * ChatGPT, sent from inside the class.
 *
 * Behind the learner's Google session rather than the ingest secret, for the
 * same reason as `/api/signed-url`: a browser cannot hold a shared secret, and
 * this route spends money on every call. It is the second choke point in the
 * product where an allowance means anything, and the first one that can be hit
 * dozens of times in a single class.
 *
 * ## What it does not do
 *
 * It does not stream. A streamed answer is nicer to watch and costs a
 * meaningfully more complicated route, a second code path for errors, and a
 * partial answer that may or may not have been billed — and the thing the
 * learner is actually waiting for is the teacher's reaction, which cannot start
 * until the answer is whole anyway. If a model starts taking twenty seconds on
 * ordinary exercises, revisit this.
 *
 * It does not keep the learner's files. Bytes are parsed in memory, sent, and
 * dropped; what survives in `practice_messages` is how many files there were
 * and how long the text was. This is a product whose first lesson is what never
 * goes into a chat window, and storing the documents it teaches people to be
 * careful with would be difficult to defend.
 */
import { NextResponse } from 'next/server';
import readXlsxFile from 'read-excel-file/node';
import type { Row } from 'read-excel-file/node';
import { currentUser } from '@/lib/supabase/server';
import { supabaseAdmin, serviceConfigured } from '@/lib/supabase/admin';
import { checkPlanAllowance, getUsageBalance } from '@/lib/account';
import { minutesLeft } from '@/lib/balance';
import { isAdminEmail } from '@/lib/admin';
import { chatStream, openrouterConfigured, type ChatMessage, type ContentPart } from '@/lib/openrouter';
import {
  attachmentKind,
  BENCH_SYSTEM,
  estimateSeconds,
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_HISTORY,
  MAX_PROMPT,
  MAX_TOTAL_CHARS,
  practiceModel,
  refusalFor,
  secondsForSpend,
  sheetToText,
  textToPrompt,
  type Rows,
} from '@/lib/practica';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/**
 * Above the client's own timeout, so the browser decides when to give up rather
 * than Vercel deciding for it. A spreadsheet-heavy first message against a slow
 * provider is the case this is sized for.
 */
export const maxDuration = 120;

/**
 * The reason, for the one person who can act on it.
 *
 * A learner gets a sentence and nothing else — the detail would be English, and
 * about our API keys, in the middle of their class. But the operator testing
 * this is signed in as an admin and reading the same screen, and until now the
 * bench answered them with the same opaque sentence: the actual cause (a
 * rejected key, an account with no credit, a model that has been retired) lived
 * only in a Vercel function log, which is a different tab, a different login,
 * and several minutes away from the click that caused it.
 *
 * `isAdminEmail` is the same gate the admin pages use, so this cannot leak to a
 * learner without an operator's address being added to ADMIN_EMAILS first.
 */
function detailFor(email: string | null | undefined, reason: string): { detail?: string } {
  return isAdminEmail(email) ? { detail: reason.slice(0, 500) } : {};
}

/** What OpenRouter reports about a finished call, once it has finished. */
interface Spend {
  costUsd: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  model: string | null;
}

/** Every failure the learner has no action for resolves to one of these. */
const UNAVAILABLE =
  'El banco de práctica no está disponible en este momento. Sigue con el profesor por voz y lo intentamos en un rato.';
const OFF =
  'El banco de práctica todavía no está encendido en esta instalación. Trabaja la tarea con el profesor por voz.';
/*
 * A stream that died with something already on screen needs its own sentence.
 * Telling somebody the bench is unavailable while half an answer sits in front
 * of them reads as a second bug, and the useful instruction is different: what
 * is there is real, it is just not finished.
 */
const PARTIAL =
  'La respuesta se cortó a la mitad. Lo que alcanzó a escribir sirve igual, pero pídeselo de nuevo si necesitas el resto.';

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Inicia sesión con Google para usar el banco de práctica.' },
      { status: 401 },
    );
  }

  if (!openrouterConfigured()) {
    console.error('[practica] OPENROUTER_API_KEY is not configured.');
    return NextResponse.json(
      { error: OFF, ...detailFor(user.email, 'OPENROUTER_API_KEY is not set in this deployment.') },
      { status: 409 },
    );
  }

  /*
   * The same gate the class passes through, so the bench cannot be the way
   * around a limit the classroom enforces. Fails open exactly as that one does:
   * a Supabase hiccup must not become a wall for somebody mid-exercise.
   */
  const allowance = await checkPlanAllowance(user.id, user.email);
  if (!allowance.allowed) {
    return NextResponse.json({ error: allowance.error }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    /*
     * Almost always the body being too large. Vercel caps a request at roughly
     * 4.5 MB and rejects it before this route runs at all, so reaching this
     * branch usually means the browser's own ceiling (`MAX_UPLOAD_BYTES`) was
     * bypassed rather than that anything here is broken.
     */
    const reason = err instanceof Error ? err.message : String(err);
    console.error('[practica] could not read the request body:', reason);
    return NextResponse.json(
      {
        error:
          'No pude recibir el mensaje, casi siempre porque los archivos pesan demasiado juntos. Manda menos por vez.',
        ...detailFor(user.email, reason),
      },
      { status: 400 },
    );
  }

  const model = practiceModel(String(form.get('model') ?? ''));
  if (!model) {
    return NextResponse.json({ error: UNAVAILABLE }, { status: 400 });
  }

  const prompt = String(form.get('prompt') ?? '')
    .trim()
    .slice(0, MAX_PROMPT);

  const files = form.getAll('file').filter((f): f is File => f instanceof File && f.size > 0);

  if (!prompt && files.length === 0) {
    return NextResponse.json({ error: 'Escríbele algo antes de enviar.' }, { status: 400 });
  }

  const sessionId = String(form.get('sessionId') ?? '').trim() || null;

  // ------------------------------------------------------------ the files --

  const warnings: string[] = [];
  const parts: ContentPart[] = [];
  const attached: string[] = [];
  let charsUsed = 0;

  /*
   * The cap is announced rather than enforced silently. A learner who attaches
   * eight files and sees five go through with no explanation concludes the
   * bench is broken; one who is told "van los primeros cinco" splits the work.
   */
  if (files.length > MAX_FILES) {
    warnings.push(
      `Adjuntaste ${files.length} archivos y por ahora van los primeros ${MAX_FILES}. Manda el resto en otro mensaje.`,
    );
  }

  for (const file of files.slice(0, MAX_FILES)) {
    if (file.size > MAX_FILE_BYTES) {
      warnings.push(
        `"${file.name}" pesa más de ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB y no lo mandé. Si es una planilla, manda solo la hoja que necesitas.`,
      );
      continue;
    }

    const kind = attachmentKind(file.name);
    if (!kind) {
      warnings.push(refusalFor(file.name));
      continue;
    }

    /*
     * The total budget is spent in the order the learner attached, and running
     * out is said out loud. Silently dropping the fourth file is how somebody
     * ends up consolidating three sheets out of four and never knowing.
     */
    if (charsUsed >= MAX_TOTAL_CHARS && (kind === 'text' || kind === 'sheet')) {
      warnings.push(`"${file.name}" no cupo en este mensaje. Mándalo en uno aparte.`);
      continue;
    }

    try {
      const bytes = Buffer.from(await file.arrayBuffer());

      if (kind === 'sheet') {
        const { rows, sheet, others } = await readSheet(bytes);
        if (others.length) {
          warnings.push(
            `De "${file.name}" mandé solo la hoja "${sheet}". Quedaron fuera: ${others.join(', ')}. Si necesitas otra, guárdala aparte y adjúntala.`,
          );
        }
        const text = sheetToText(
          `${file.name}${sheet ? ` · hoja "${sheet}"` : ''}`,
          rows,
          Math.min(MAX_TOTAL_CHARS - charsUsed, 40_000),
        );
        charsUsed += text.length;
        parts.push({ type: 'text', text });
      } else if (kind === 'text') {
        const text = textToPrompt(
          file.name,
          bytes.toString('utf8'),
          Math.min(MAX_TOTAL_CHARS - charsUsed, 40_000),
        );
        charsUsed += text.length;
        parts.push({ type: 'text', text });
      } else if (kind === 'pdf') {
        parts.push({
          type: 'file',
          file: {
            filename: file.name,
            file_data: `data:application/pdf;base64,${bytes.toString('base64')}`,
          },
        });
      } else {
        parts.push({
          type: 'image_url',
          image_url: {
            url: `data:${file.type || 'image/png'};base64,${bytes.toString('base64')}`,
          },
        });
      }

      attached.push(file.name);
    } catch (err) {
      console.error('[practica] could not read attachment:', err);
      warnings.push(
        `No pude abrir "${file.name}". Si es una planilla, descárgala como .csv desde Sheets o Excel y vuelve a intentarlo.`,
      );
    }
  }

  // --------------------------------------------------------- the messages --

  const history = parseHistory(form.get('history'));

  const messages: ChatMessage[] = [
    { role: 'system', content: BENCH_SYSTEM },
    ...history,
    {
      role: 'user',
      /*
       * Files first, question last. Every one of these families follows a long
       * prompt better when the instruction is the last thing it reads, and the
       * bench is where a learner discovers that ordering matters — so the bench
       * should not be the thing quietly working around it.
       */
      content: parts.length ? [...parts, { type: 'text', text: prompt }] : prompt,
    },
  ];

  // ------------------------------------------------------------- the call --

  /*
   * From here the response is a stream, so failures change shape.
   *
   * Everything above answers with a status code and a JSON body, because
   * nothing has been sent yet. Once the first byte of the stream is out the
   * status is already 200 and cannot be taken back, so a failure after that
   * point travels as an `error` line inside the stream and the client decides
   * what to show. The two paths are deliberately not merged: a pre-flight
   * failure should be a 403 or a 409 that a log or a probe can see.
   */
  const encoder = new TextEncoder();
  const line = (value: unknown) => encoder.encode(`${JSON.stringify(value)}\n`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = '';
      /*
       * A holder rather than a plain `let`, because the assignment happens
       * inside a callback and TypeScript's flow analysis cannot see it: read
       * back afterwards, a `let` initialised to null narrows to `never` and
       * every field access below stops compiling. The object is opaque to that
       * analysis, which is the honest fix — the value really is assigned by
       * then, and the alternative is a cast that asserts it without saying why.
       */
      const captured: { spend: Spend | null } = { spend: null };

      if (warnings.length) controller.enqueue(line({ t: 'warn', warnings }));

      try {
        await chatStream(
          { model: model.model, messages, timeoutMs: 100_000 },
          {
            onText: (chunk) => {
              answer += chunk;
              controller.enqueue(line({ t: 'text', v: chunk }));
            },
            /*
             * Captured rather than acted on. `chatStream` fires this from its
             * own `finally`, so it runs on a thrown call too — which is the
             * point, because a call that died halfway was still generated and
             * charged by the provider. The billing happens below, on the one
             * path both outcomes share.
             */
            onDone: (final) => {
              captured.spend = final;
            },
          },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[practica] call failed:', message);
        controller.enqueue(
          line({
            t: 'error',
            error: answer ? PARTIAL : UNAVAILABLE,
            ...detailFor(user.email, message),
          }),
        );
      } finally {
        /*
         * Bill, then read the balance, then tell the panel — in that order, and
         * awaited, so the meter the learner sees already counts the message
         * they just sent. A meter that lags by one message is reported as
         * broken the first time somebody watches it.
         *
         * It costs a moment of the connection staying open after the last
         * token, which nobody is waiting on: the answer is already on screen.
         */
        const { spend } = captured;
        const seconds = spend
          ? spend.costUsd !== null
            ? secondsForSpend(spend.costUsd)
            : estimateSeconds(prompt.length, charsUsed)
          : estimateSeconds(prompt.length, charsUsed);

        await finish({
          userId: user.id,
          sessionId,
          provider: model.id,
          model: spend?.model ?? model.model,
          usage: {
            costUsd: spend?.costUsd ?? null,
            promptTokens: spend?.promptTokens ?? null,
            completionTokens: spend?.completionTokens ?? null,
          },
          seconds,
          attachments: attached,
          prompt,
          answer,
        });

        controller.enqueue(
          line({ t: 'done', seconds, minutesLeft: await remaining(user.id, user.email) }),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      /*
       * Vercel's edge buffers a response without this, which turns a stream
       * into one delivery at the end — the exact behaviour streaming was added
       * to remove, and invisible in local development where there is no proxy.
       */
      'X-Accel-Buffering': 'no',
    },
  });
}

// ----------------------------------------------------------------- helpers --

/**
 * A workbook, as the first sheet's rows of strings plus the names of the ones
 * left behind.
 *
 * Every cell is stringified here rather than downstream, and dates are the
 * reason the library is a dependency at all: a date cell in xlsx is a serial
 * number, and a hand-rolled reader hands the model `45678` where the learner
 * sees `2025-01-15`. The model then computes confidently over it. That is the
 * exact failure this product is built to teach people to catch, so shipping it
 * in our own tooling is not an option.
 *
 * Only the first sheet, and the others are named back so the omission can be
 * said out loud. Reading every sheet silently multiplies the cost of a message
 * by however many tabs somebody happens to keep; dropping them silently is how
 * a learner consolidates three months out of twelve and never finds out.
 */
async function readSheet(
  bytes: Buffer,
): Promise<{ rows: Rows; sheet: string; others: readonly string[] }> {
  const sheets = await readXlsxFile(bytes);
  const first = sheets[0];
  if (!first) return { rows: [], sheet: '', others: [] };

  return {
    rows: first.data.map((row: Row) =>
      row.map((cell) => {
        if (cell === null || cell === undefined) return '';
        // `instanceof` rather than a type guard: this library's CellValue types
        // a date cell as `typeof Date`, which is not what it returns.
        if (cell instanceof Date) return cell.toISOString().slice(0, 10);
        return String(cell);
      }),
    ),
    sheet: first.sheet,
    others: sheets.slice(1).map((s) => s.sheet),
  };
}

/**
 * The conversation so far, as the browser reports it.
 *
 * Trusted for content and not for size: it is the learner's own text coming
 * back, so there is nothing to protect them from, but an unbounded history is a
 * way to make every message cost as much as the whole class. Text only —
 * attachments ride on the turn they were attached to and are never resent.
 */
function parseHistory(raw: FormDataEntryValue | null): ChatMessage[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (t): t is { role: string; content: string } =>
          !!t &&
          typeof t === 'object' &&
          typeof (t as { content?: unknown }).content === 'string' &&
          ((t as { role?: unknown }).role === 'user' ||
            (t as { role?: unknown }).role === 'assistant'),
      )
      .slice(-MAX_HISTORY)
      .map((t) => ({
        role: t.role as 'user' | 'assistant',
        content: t.content.slice(0, MAX_PROMPT),
      }));
  } catch {
    return [];
  }
}

/**
 * Everything that happens after the learner has their answer: the transcript,
 * the charge, and the balance the meter reads.
 *
 * Never throws. A lost row must not cost somebody the answer they are looking
 * at, and by the time this runs the response has already been streamed — there
 * is nothing left to fail into.
 */
async function finish(entry: {
  userId: string;
  sessionId: string | null;
  provider: string;
  model: string;
  usage: { costUsd: number | null; promptTokens: number | null; completionTokens: number | null };
  seconds: number;
  attachments: readonly string[];
  prompt: string;
  answer: string;
}): Promise<void> {
  if (!serviceConfigured()) return;

  /*
   * Two rows, one per turn, which is what makes this a transcript rather than a
   * ledger with text bolted on. Read back in `created_at` order it is an
   * ordinary conversation, and the teacher can be handed a learner's history of
   * prompts across sessions — the thing that turns a reaction into a lesson
   * ("escribiste la petición sin decir para quién es, igual que la semana
   * pasada").
   *
   * The charge sits on the assistant row. Both views sum `billed_seconds`, so a
   * user row at zero changes no arithmetic.
   */
  try {
    const { error } = await supabaseAdmin()
      .from('practice_messages')
      .insert([
        {
          user_id: entry.userId,
          session_id: entry.sessionId,
          provider: entry.provider,
          model: entry.model,
          role: 'user',
          content: entry.prompt,
          billed_seconds: 0,
          attachments: entry.attachments.length,
          prompt_chars: entry.prompt.length,
          answer_chars: 0,
        },
        {
          user_id: entry.userId,
          session_id: entry.sessionId,
          provider: entry.provider,
          model: entry.model,
          role: 'assistant',
          content: entry.answer,
          prompt_tokens: entry.usage.promptTokens,
          completion_tokens: entry.usage.completionTokens,
          cost_usd: entry.usage.costUsd,
          billed_seconds: entry.seconds,
          attachments: 0,
          prompt_chars: 0,
          answer_chars: entry.answer.length,
        },
      ]);
    if (error) console.error('[practica] could not record the exchange:', error.message);
  } catch (err) {
    console.error('[practica] transcript write threw:', err);
  }
}

/**
 * What the learner has left, for the meter in the panel.
 *
 * Read after the charge rather than before, so the number the learner sees is
 * the one that includes the message they just sent. A meter that lags by one
 * message is a meter somebody reports as broken the first time they watch it.
 *
 * Null whenever the plan does not meter, and the panel renders nothing at all
 * in that case — a countdown shown to somebody who is not being counted is a
 * lie, and one they would believe.
 */
async function remaining(userId: string, email: string | null | undefined): Promise<number | null> {
  try {
    return minutesLeft(await getUsageBalance(userId, email));
  } catch (err) {
    console.error('[practica] could not read the balance:', err);
    return null;
  }
}
