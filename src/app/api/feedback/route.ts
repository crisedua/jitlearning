/**
 * Receives a feedback submission from /feedback.
 *
 * Open on purpose — feedback is welcome from people who never signed in, and
 * asking someone to authenticate before criticizing you is a good way to hear
 * nothing. When the submitter *is* signed in, their user id rides along, which
 * is what later lets the six-month grant be applied to the right account
 * without an email hunt.
 *
 * The write goes through the service role: the table has RLS on and no
 * policies, so the browser could not insert (or read anyone else's feedback)
 * even if it tried.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/supabase/server';
import { serviceConfigured, supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  name: z.string().trim().min(1, 'Falta tu nombre.').max(200),
  email: z.string().trim().email('Ese correo no parece válido.').max(320),
  // A cap generous enough for real feedback and small enough that the table
  // cannot be used as free storage.
  message: z.string().trim().min(10, 'Cuéntanos un poco más — al menos una frase.').max(5_000),
});

export async function POST(req: Request) {
  if (!serviceConfigured()) {
    return NextResponse.json(
      { error: 'El buzón no está configurado en este despliegue.' },
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

  // Best-effort: a signed-in submitter gets linked, everyone else stays null.
  const user = await currentUser().catch(() => null);

  const { error } = await supabaseAdmin().from('feedback').insert({
    user_id: user?.id ?? null,
    name: parsed.data.name,
    email: parsed.data.email,
    message: parsed.data.message,
  });

  if (error) {
    console.error('[feedback] insert failed:', error.message);
    return NextResponse.json(
      { error: 'No pudimos guardar tu feedback. Inténtalo de nuevo en un momento.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
