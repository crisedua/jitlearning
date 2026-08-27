/**
 * Receives a sign-up from /registro.
 *
 * Open on purpose, and for a stronger reason than /feedback is. Signing up is
 * the step *before* having an account: asking somebody to authenticate with
 * Google in order to tell you they are interested inverts the order of the two
 * things, and the people most worth capturing — the ones still deciding — are
 * exactly the ones who will not do it.
 *
 * The write goes through the service role. `signups` has RLS on and no
 * policies, so the browser could not insert, and more to the point could not
 * read: the table holds names, emails and phone numbers for every person who
 * ever filled the form in.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/supabase/server';
import { serviceConfigured, supabaseAdmin } from '@/lib/supabase/admin';
import {
  EMPLOYMENT,
  PHONE_MAX_DIGITS,
  PHONE_MIN_DIGITS,
  normalisePhone,
} from '@/lib/signup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  fullName: z.string().trim().min(1, 'Falta tu nombre.').max(200),
  /*
   * Optional here and required in the table, which is not a contradiction: an
   * empty box falls back to the first word of the full name below. Making the
   * person type "Fran" when they have already typed "Francisca Rojas" is a
   * field they will resent, and the fallback is right often enough that asking
   * twice is the unusual case rather than the default.
   */
  callName: z.string().trim().max(80).optional(),
  email: z.string().trim().email('Ese correo no parece válido.').max(320),
  phone: z.string().trim().min(1, 'Falta tu teléfono.').max(40),
  employment: z.enum(EMPLOYMENT, {
    message: 'Elige una de las tres opciones.',
  }),
});

export async function POST(req: Request) {
  if (!serviceConfigured()) {
    return NextResponse.json(
      { error: 'El registro no está configurado en este despliegue.' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Revisa los campos.' },
      { status: 400 },
    );
  }

  const phone = normalisePhone(parsed.data.phone);
  const digits = phone.replace(/\D/g, '').length;
  if (digits < PHONE_MIN_DIGITS || digits > PHONE_MAX_DIGITS) {
    return NextResponse.json(
      { error: 'Ese teléfono no parece completo. Revísalo.' },
      { status: 400 },
    );
  }

  // Lowercased before it is written, because the unique constraint on the
  // column is what stops one person becoming two rows and it compares bytes.
  const email = parsed.data.email.toLowerCase();

  // Best-effort: somebody who already signed in gets linked, everyone else
  // stays null. Never fatal — the sign-up matters more than the link.
  const user = await currentUser().catch(() => null);

  /*
   * Upsert, not insert, so that filling the form in twice is an edit.
   *
   * The second submission is almost always a correction — a mistyped phone, a
   * changed situation — and rejecting it with "ya estás registrado" leaves the
   * wrong details in the table and the person with no way to fix them. On
   * conflict, PostgREST updates exactly the columns named below, which is why
   * `user_id` is omitted when there is none: sending null would unlink an
   * account that a previous, signed-in submission had already attached.
   */
  const { error } = await supabaseAdmin()
    .from('signups')
    .upsert(
      {
        ...(user ? { user_id: user.id } : {}),
        full_name: parsed.data.fullName,
        call_name: parsed.data.callName || parsed.data.fullName.split(/\s+/)[0]!,
        email,
        phone,
        employment: parsed.data.employment,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'email' },
    );

  if (error) {
    console.error('[signups] upsert failed:', error.message);
    return NextResponse.json(
      { error: 'No pudimos guardar tu registro. Inténtalo de nuevo en un momento.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
