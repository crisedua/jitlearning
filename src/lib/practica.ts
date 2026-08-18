/**
 * The practice bench: a real assistant, inside the class, with the teacher watching.
 *
 * ## Why this exists
 *
 * The teacher was blind. A voice agent that cannot see what the learner is
 * doing has exactly one way to find out — ask — and that produced classes like
 * this one, verbatim from a real session:
 *
 *   «¿son tres archivos de Google Sheets distintos?»
 *   «cuando los consolidas, ¿qué haces exactamente?»
 *   «¿cuántas filas tiene aproximadamente? ¿Veinte, cien, mil?»
 *
 * Three turns spent reconstructing a spreadsheet by interview, from a learner
 * who had the file open the whole time. Every one of those questions is
 * answerable by handing the file to an assistant, which is the thing the class
 * is supposed to be teaching. The interrogation was not a persona bug so much
 * as the only move available to a teacher with no eyes.
 *
 * So the bench gives it eyes. What the learner types here and what the model
 * answers go into the live call as a contextual update — silent, no spoken turn
 * spent — and the teacher reacts to the actual output instead of asking after
 * it. `VoiceTutor` already uses that channel for the wrap-up timers.
 *
 * ## It is a rehearsal, and saying so is load-bearing
 *
 * The learner practises here and then does the real task in their own Gemini,
 * Claude or ChatGPT account. That ordering is a commercial decision and it is
 * the right one: level 1's promise is a weekly saving that repeats, and a
 * saving that only exists while somebody keeps paying us is not the thing the
 * landing page sells. A learner who finished their task here would have a
 * number that dies with their subscription.
 *
 * The bench removes the setup friction from the *first* attempt — no account,
 * no tab, no "no tengo cuenta de Gemini" thirty seconds into a ten-minute class
 * — and hands the transferable half over: what to write, what the answer looks
 * like, how to tell when it is wrong.
 *
 * ## These are the models, not the products
 *
 * You cannot embed gemini.google.com, chatgpt.com or claude.ai — they refuse
 * framing, and driving somebody's logged-in account from our page is not on the
 * table. What runs here is the same model over an API. That distinction is
 * small in the answer and large in the product: no memory between chats, no
 * Google Drive, no Gems or Projects, none of the buttons. The UI says so and the
 * persona is told to say so, because a learner who believes they have used
 * Gemini and then opens the real one is a learner we misled.
 *
 * Pure: no I/O, no React, no Supabase. The route, the component and the tests
 * all read the same limits from here.
 */
import { DEFAULT_INPUTS, project } from './costs';

/**
 * The three, in the order the picker shows them.
 *
 * `id` is what the learner's browser sends and is deliberately not the model
 * slug: slugs move every few months (this file has already outlived
 * `gemini-3-pro`), and a stored preference or a bookmarked request should not
 * break when a model is retired.
 *
 * `model` is overridable per deployment because *which* member of a family
 * corresponds to what a person gets in the free consumer product is a guess,
 * and it changes. What is not a guess is the family, which is the only part the
 * learner is told.
 */
export interface PracticeModel {
  id: 'gemini' | 'claude' | 'chatgpt';
  /** The family, as the learner knows it from the product they will go and use. */
  label: string;
  /** The specific model, shown in smaller type so the claim stays exact. */
  detail: string;
  /** OpenRouter slug. */
  model: string;
  /** One line on what this one is known for, so the choice is not a coin flip. */
  note: string;
}

export const PRACTICE_MODELS: readonly PracticeModel[] = [
  {
    id: 'gemini',
    label: 'Gemini',
    detail: 'Gemini 3.7 Flash, de Google',
    model: process.env.PRACTICE_MODEL_GEMINI?.trim() || 'google/gemini-3.7-flash',
    note: 'Rápido y barato. Es el que más se parece a lo que vas a tener gratis en tu cuenta de Google.',
  },
  {
    id: 'claude',
    label: 'Claude',
    detail: 'Claude Sonnet 5, de Anthropic',
    model: process.env.PRACTICE_MODEL_CLAUDE?.trim() || 'anthropic/claude-sonnet-5',
    note: 'Suele seguir instrucciones largas con más cuidado. Bueno cuando le das mucho contexto.',
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    detail: 'GPT-5.6 Terra, de OpenAI',
    model: process.env.PRACTICE_MODEL_CHATGPT?.trim() || 'openai/gpt-5.6-terra',
    note: 'El más conocido. Si en tu trabajo ya usan uno, casi siempre es este.',
  },
] as const;

export type PracticeModelId = PracticeModel['id'];

export function practiceModel(id: string): PracticeModel | null {
  return PRACTICE_MODELS.find((m) => m.id === id) ?? null;
}

/**
 * How a model named out loud becomes one we are willing to bill.
 *
 * The teacher fires `open_model_sandbox` with whatever the learner said, and
 * what arrives is a word from a conversation: "gemini", "el de Google",
 * "google/gemini-3.7-flash", "chat gpt". Two things must not happen with that
 * string. It must not reach OpenRouter — an agent that can name any slug can
 * name an expensive one, or a hallucinated one, and either way we pay for the
 * attempt. And it must not fail the tool call, because a failed tool inside a
 * voice class is a teacher apologising for a panel that did not open.
 *
 * So it resolves to one of the three configured models or to null, and null is
 * handled by opening on the default rather than by refusing.
 */
export function resolveModel(spoken: string | null | undefined): PracticeModel | null {
  if (!spoken) return null;
  const said = spoken.trim().toLowerCase();
  if (!said) return null;

  const byId = practiceModel(said);
  if (byId) return byId;

  // The full OpenRouter slug, when the agent repeats one back to us.
  const bySlug = PRACTICE_MODELS.find((m) => m.model.toLowerCase() === said);
  if (bySlug) return bySlug;

  /*
   * Otherwise by family name inside whatever was said. "chatgpt" and "gpt" both
   * have to land on OpenAI, and "openai" too, because the teacher refers to
   * these three by several names in the same class.
   */
  const families: Array<[PracticeModelId, readonly string[]]> = [
    ['gemini', ['gemini', 'google', 'bard']],
    ['claude', ['claude', 'anthropic', 'sonnet', 'opus']],
    ['chatgpt', ['chatgpt', 'chat gpt', 'gpt', 'openai']],
  ];
  for (const [id, words] of families) {
    if (words.some((w) => said.includes(w))) return practiceModel(id);
  }
  return null;
}

/** What the picker starts on when nobody said which. */
export const DEFAULT_MODEL: PracticeModelId = 'gemini';

/**
 * The client tool the teacher fires to open the bench mid-class.
 *
 * A *client* tool: ElevenLabs relays the call over the open socket to the
 * browser, nothing runs on our server, and the panel appears while the teacher
 * is still speaking. A webhook tool could not do this — the server has no way
 * to reach into the page.
 *
 * The description is an instruction rather than documentation, the same as the
 * lookup tool's. It is the only thing deciding when the bench opens, and both
 * failure modes are real: a teacher that never opens it teaches a class about
 * an assistant the learner cannot reach, and one that opens it constantly puts
 * a panel in front of somebody walking with no screen.
 *
 * `expects_response` is true so the browser can answer with what happened. The
 * teacher needs to know whether the panel is actually in front of them before
 * saying "escríbele esto".
 */
export const SANDBOX_TOOL = {
  type: 'client' as const,
  name: 'open_model_sandbox',
  description:
    'Abre el banco de práctica en la pantalla del alumno, con un asistente listo para que le escriba. ' +
    'Úsala cuando vayan a practicar con un asistente: cuando el alumno pida probar uno, cuando le vayas ' +
    'a dictar una petición para pegar, o cuando la clase llegue a la parte de hacer la tarea. ' +
    'Úsala también si el alumno pide cambiar a otro asistente. ' +
    'No la uses si te dijo que va caminando o manejando: ahí no hay pantalla y el panel no sirve de nada. ' +
    'Después de llamarla, dile en una frase que ya lo tiene abajo y dictale qué escribir. ' +
    'Lo que el alumno escriba y lo que el asistente responda te van a llegar solos: no se los preguntes.',
  response_timeout_secs: 10,
  expects_response: true,
  parameters: {
    type: 'object' as const,
    properties: {
      model: {
        type: 'string',
        description:
          'Con cuál va a practicar, en una palabra: "gemini", "claude" o "chatgpt". ' +
          'Si el alumno no dijo cuál, manda "gemini", que es el más parecido a lo que tiene gratis.',
      },
      task: {
        type: 'string',
        description:
          'Opcional. La tarea concreta que van a practicar, en una frase y en las palabras del alumno, ' +
          'por ejemplo "consolidar las tres planillas de ventas del mes". Se muestra arriba del ' +
          'cuadro de texto para que no se le olvide qué estaba haciendo. No pongas acá la petición ' +
          'que le dictaste: esa la escribe él.',
      },
    },
    required: ['model'],
  },
};

// ------------------------------------------------------------------ limits --

/**
 * Ceilings, all of them chosen against one number: a class is ten minutes.
 *
 * Nothing here is a technical limit — the models take a million tokens. They
 * are limits on what can happen inside a class without the learner sitting in
 * silence, and on what one exchange may cost when the whole allowance is twenty
 * minutes on the free tier.
 */
export const MAX_FILES = 5;
/** Per file, before parsing. A weekly report that exceeds this is not a first exercise. */
export const MAX_FILE_BYTES = 3 * 1024 * 1024;
/**
 * Across every file in one message, and this one is not a preference.
 *
 * Vercel refuses a request body over about 4.5 MB, and it refuses it *before*
 * the route runs — `req.formData()` throws and the learner is told the bench is
 * unavailable, with nothing in the logs naming a size. So the ceiling has to be
 * enforced in the browser, where the files still exist and the message can name
 * the actual problem.
 *
 * 4 MB rather than 4.5: multipart framing and the field names ride in the same
 * body, and being refused at the platform edge costs the learner a class turn
 * to discover.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/** Characters of extracted text per file, and across all of them. */
export const MAX_FILE_CHARS = 40_000;
export const MAX_TOTAL_CHARS = 120_000;
/** The learner's own message. Long enough for a real prompt with context in it. */
export const MAX_PROMPT = 8_000;
/**
 * Turns of history sent back with each message.
 *
 * Six is three exchanges, which covers "hazlo otra vez pero sin la columna de
 * totales" and stops well short of resending a whole class every turn. The
 * files ride only on the message they were attached to; re-sending 120k
 * characters on every follow-up is how a practice session costs more than the
 * class around it.
 */
export const MAX_HISTORY = 6;

/** What the bench accepts, and how each kind gets to the model. */
export type AttachmentKind =
  /** Decoded as UTF-8 and pasted in. csv, tsv, txt, md, json. */
  | 'text'
  /** Parsed to rows here, then pasted in as CSV. xlsx, xlsm. */
  | 'sheet'
  /** Handed to the model as a file; it does its own extraction. */
  | 'pdf'
  /** Handed to the model as an image. png, jpg, webp, gif. */
  | 'image';

const BY_EXTENSION: Record<string, AttachmentKind> = {
  csv: 'text',
  tsv: 'text',
  txt: 'text',
  md: 'text',
  json: 'text',
  xlsx: 'sheet',
  xlsm: 'sheet',
  pdf: 'pdf',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
};

/**
 * Classified by extension rather than by MIME type, on purpose.
 *
 * Browsers disagree about spreadsheets — the same .csv arrives as `text/csv`,
 * `application/vnd.ms-excel` or an empty string depending on what else is
 * installed on the machine — and the one the learner can see and reason about
 * is the extension. When this returns null the file is refused by name, which
 * is a message they can act on ("no leo .doc todavía") rather than a mime type
 * they cannot.
 */
export function attachmentKind(filename: string): AttachmentKind | null {
  const ext = filename.toLowerCase().split('.').pop();
  return (ext && BY_EXTENSION[ext]) || null;
}

/**
 * Whether this set of files can be sent at all, said as a sentence.
 *
 * Returns null when they fit. Checked in the browser because the platform
 * rejects an oversized body before any of our code sees it — see
 * `MAX_UPLOAD_BYTES`.
 */
export function tooLarge(sizes: readonly number[]): string | null {
  const total = sizes.reduce((sum, n) => sum + n, 0);
  if (total <= MAX_UPLOAD_BYTES) return null;
  const mb = (n: number) => (n / (1024 * 1024)).toFixed(1).replace('.', ',');
  return (
    `Entre todo pesa ${mb(total)} MB y el máximo por mensaje es ${mb(MAX_UPLOAD_BYTES)} MB. ` +
    'Manda menos archivos por vez, o si es una planilla, descarga solo la hoja que necesitas.'
  );
}

/** The extensions, for the file input's `accept` and for the refusal message. */
export const ACCEPTED_EXTENSIONS = Object.keys(BY_EXTENSION).map((e) => `.${e}`);

/**
 * Why a file was refused, said to the learner.
 *
 * `.xls` and `.doc` get their own sentence because they are the two that show
 * up, and "convert it first" is a thing somebody can do in twenty seconds. A
 * generic "formato no soportado" makes them give up instead.
 */
export function refusalFor(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (ext === 'xls') {
    return `"${filename}" está en el formato viejo de Excel. Ábrelo y guárdalo como .xlsx, o descárgalo como .csv, y lo leo.`;
  }
  if (ext === 'doc' || ext === 'docx') {
    return `"${filename}" es un documento de Word y todavía no lo leo. Guárdalo como PDF y lo abro.`;
  }
  return `"${filename}" no lo puedo leer acá. Por ahora leo planillas (.csv, .xlsx), texto, PDF e imágenes.`;
}

// -------------------------------------------------------- table to prompt ---

/** A parsed spreadsheet, as rows of already-stringified cells. */
export type Rows = readonly (readonly string[])[];

/**
 * A sheet, rendered as the CSV a model reads best.
 *
 * Truncation is announced *in the text the model receives*, not just to the
 * learner. A model handed 200 of 5,000 rows with no marker will happily write
 * "el total es 4.812" about the fifth of the file it saw, and the learner will
 * write that number into a report. The marker is what lets it say "solo vi las
 * primeras 200 filas" instead, which is also the lesson — every level 2 class
 * is about checking the output before trusting it.
 */
export function sheetToText(name: string, rows: Rows, limit = MAX_FILE_CHARS): string {
  const body = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  const head = `--- ${name} (${rows.length} ${rows.length === 1 ? 'fila' : 'filas'}) ---`;

  if (body.length <= limit) return `${head}\n${body}`;

  /*
   * Cut on a row boundary. Half a row of CSV reads to a model as a real row
   * with missing columns, which is worse than one row fewer.
   */
  const cut = body.lastIndexOf('\n', limit);
  const kept = body.slice(0, cut > 0 ? cut : limit);
  const shown = kept.split('\n').length;
  return (
    `${head}\n${kept}\n` +
    `[CORTADO: de este archivo solo ves las primeras ${shown} filas de ${rows.length}. ` +
    `No calcules totales ni saques conclusiones sobre el archivo completo; dilo si te faltan datos.]`
  );
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The same truncation contract for a plain text file. */
export function textToPrompt(name: string, text: string, limit = MAX_FILE_CHARS): string {
  const head = `--- ${name} ---`;
  if (text.length <= limit) return `${head}\n${text}`;
  return (
    `${head}\n${text.slice(0, limit)}\n` +
    `[CORTADO: este archivo sigue más allá de lo que ves. Dilo si te faltan datos.]`
  );
}

// -------------------------------------------------------------- the system --

/**
 * What the practice model is told, which is almost nothing.
 *
 * The temptation is to make it a second teacher — helpful, pedagogical, gentle
 * about mistakes. That would defeat the exercise. The learner is here to find
 * out what a raw assistant does with what they wrote, including inventing a
 * column that was not in the file, because the class after this one is about
 * catching exactly that. A bench model that quietly compensates for a bad
 * prompt teaches nothing and makes the real Gemini look broken by comparison.
 *
 * So: the language, and nothing else. The consumer products carry their own
 * system prompts that we cannot see and would not want to guess at.
 */
export const BENCH_SYSTEM =
  'Responde en español neutro, salvo que te pidan otro idioma. No expliques que eres un modelo ni cómo funcionas.';

// ------------------------------------------------------ what the teacher sees --

/** One exchange, as the teacher is told about it. */
export interface BenchExchange {
  model: PracticeModel;
  prompt: string;
  attachments: readonly string[];
  answer: string;
}

/** How much of each side the teacher gets. */
const UPDATE_PROMPT_CHARS = 700;
const UPDATE_ANSWER_CHARS = 1_400;

/**
 * The contextual update pushed into the live call after every exchange.
 *
 * Written as a briefing rather than a transcript dump, and it carries an
 * instruction as well as the content. Without one the model treats an inbound
 * context update as something to acknowledge — "ya vi que te respondió" — which
 * spends a spoken turn saying nothing. What is wanted is that the *next* thing
 * it says is about this output.
 *
 * The answer gets more room than the prompt because the answer is where the
 * teachable failures are: the invented column, the total computed over the
 * truncated half, the confident tone on a wrong number. Both are trimmed, since
 * this rides in the same context window as the persona and a pasted report
 * would push the session rules out of it.
 */
export function benchUpdate(exchange: BenchExchange): string {
  const files = exchange.attachments.length
    ? ` Adjuntó: ${exchange.attachments.join(', ')}.`
    : '';

  return (
    `[BANCO DE PRÁCTICA] Tu alumno acaba de escribirle a ${exchange.model.label} desde la ` +
    `pantalla de la clase.${files}\n\n` +
    `Le escribió:\n"${clip(exchange.prompt, UPDATE_PROMPT_CHARS)}"\n\n` +
    `${exchange.model.label} le respondió:\n"${clip(exchange.answer, UPDATE_ANSWER_CHARS)}"\n\n` +
    'No anuncies que lo viste ni se lo leas de vuelta. Míralo y dile lo siguiente que le sirva: ' +
    'qué le faltó a lo que escribió, qué parte de la respuesta no puede creerse todavía y cómo ' +
    'comprobarla. Si está bien, dilo en una frase y pásale el siguiente paso.'
  );
}

/** The update sent when the exchange failed, so the teacher is not left waiting. */
export function benchFailureUpdate(reason: string): string {
  return (
    `[BANCO DE PRÁCTICA] El intento de tu alumno no llegó a salir: ${reason} ` +
    'Dile en una frase que fue el banco y no ella, y sigan por voz mientras tanto.'
  );
}

function clip(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length <= max ? clean : `${clean.slice(0, max)}… [cortado]`;
}

// ------------------------------------------------------------- the metering --

/**
 * What a spoken minute costs us, from the model that already answers that.
 *
 * Derived rather than typed as a constant, because a constant here would be a
 * fourth copy of a number `docs/pricing.md`, `costs.ts` and the admin page
 * already disagree about periodically. `marginalPerMinute` is the right one:
 * the cost of one *more* minute, which is exactly what a practice message
 * displaces when it is charged against the same allowance.
 */
export const USD_PER_MINUTE = project(DEFAULT_INPUTS).marginalPerMinute;

/**
 * A practice exchange, converted into the minutes it spends.
 *
 * One allowance, because the learner has one. A second meter — "quedan 12
 * minutos y 34 mensajes" — is a second thing to explain on the pricing page, a
 * second wall to hit, and a second number to keep honest, in exchange for
 * precision nobody asked for.
 *
 * Rounded up to whole seconds and floored at one, so an exchange is never free:
 * an unmetered path through a paid API is the shape of the bill nobody notices
 * until it arrives. The rounding is generous to us by well under a cent and
 * makes the meter monotonic, which matters more — a learner watching their
 * balance not move after sending a message reports it as broken.
 */
export function secondsForSpend(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 1;
  return Math.max(1, Math.ceil((usd / USD_PER_MINUTE) * 60));
}

/**
 * A rough price for one exchange, for the estimate shown before sending.
 *
 * Only used where an estimate is honest — OpenRouter reports the real cost with
 * the response, and that is what gets written to the ledger.
 */
export function estimateSeconds(promptChars: number, attachedChars: number): number {
  const tokens = (promptChars + attachedChars) / 4 + 500;
  // Blended input/output rate across the three families, to one significant
  // figure. An estimate carried to four decimals would be pretending.
  return secondsForSpend((tokens / 1_000_000) * 3);
}
