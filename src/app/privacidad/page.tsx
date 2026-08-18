import type { Metadata } from 'next';
import Link from 'next/link';
import { PROFILE } from '@/lib/site';

/**
 * What happens to what somebody says here.
 *
 * The site had nothing. The one mention of data on it was the landing page
 * inviting people to bring theirs — "con tus datos, hoy" — and the teacher
 * spends the first two minutes of a class on what never goes into a chat
 * window. So the product asks for work material, warns about work material out
 * loud, and said nothing in writing anywhere.
 *
 * That is a gap at the moment of deciding, not only a legal one. Somebody
 * weighing whether to open a client's document in front of a microphone wants to
 * know who hears it, and a page that does not answer is answering.
 *
 * Everything here is checked against the code rather than written from the
 * shape of a privacy policy. The tables are the ones in the migrations, the
 * third parties are the ones with credentials in this deployment, and the audio
 * claim comes from asking the ElevenLabs API what it holds for a real
 * conversation. Nothing promises a retention window this product does not
 * control, and nothing claims a certification it does not have.
 */
export const metadata: Metadata = {
  title: 'Privacidad · ModoJIT',
  description: 'Qué se guarda de una clase, quién lo puede ver y cómo se borra.',
};

export default function PrivacidadPage() {
  return (
    <section className="mx-auto max-w-[46rem] px-6 py-16 sm:py-20">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Privacidad</p>

      <h1 className="mt-4 max-w-[22ch] font-serif text-[clamp(2rem,4.5vw,3rem)] font-normal leading-[1.06] tracking-[-0.02em]">
        Qué pasa con lo que dices en una clase.
      </h1>

      <p className="mt-5 text-[17px] leading-relaxed text-muted">
        Esta página está escrita mirando el código, no copiada de una plantilla. Si algo de acá
        deja de ser cierto, es un error nuestro y queremos saberlo.
      </p>

      <h2 className="mt-12 font-serif text-[24px] font-normal leading-snug">La clase se graba</h2>
      <p className="mt-3 text-[17px] leading-relaxed text-muted">
        La conversación pasa por ElevenLabs, que convierte tu voz en texto, genera la respuesta y
        la vuelve a convertir en voz. Ellos guardan el audio y la transcripción de cada clase, bajo
        sus propias políticas. Sin eso no hay clase por voz: es la herramienta, no un extra.
      </p>

      <h2 className="mt-10 font-serif text-[24px] font-normal leading-snug">Qué guardamos nosotros</h2>
      <p className="mt-3 text-[17px] leading-relaxed text-muted">
        En nuestra base de datos, que es Supabase, queda un resumen de la clase y unos pocos campos: a qué te
        dedicas, tu sector, los años que llevas, las tareas de tu semana, las herramientas que
        usas, qué buscas, tu plan, lo que te comprometiste a hacer, los minutos que medimos y lo
        que escribas tú en tu página de progreso. No guardamos el audio.
      </p>

      <h2 className="mt-10 font-serif text-[24px] font-normal leading-snug">
        Quiénes más están en el camino
      </h2>
      <p className="mt-3 text-[17px] leading-relaxed text-muted">
        ElevenLabs mueve la voz y guarda el audio y la transcripción. Supabase es la base de datos
        y también quien maneja tu inicio de sesión con Google. Vercel sirve las páginas, así que ve
        las peticiones. Cuando el profesor busca algo actual, la pregunta va a Anthropic, junto con
        una línea de contexto sobre tu rol si la hay, y nada más: ni tu nombre, ni tu correo, ni tu
        cuenta. Y si algún día pagas, la tarjeta la recibe Stripe y nunca pasa por acá.
      </p>

      <h2 className="mt-10 font-serif text-[24px] font-normal leading-snug">Quién lo ve</h2>
      <p className="mt-3 text-[17px] leading-relaxed text-muted">
        Tú, en tu página de progreso, y quien opera ModoJIT. Nadie más: la base de datos está
        cerrada por usuario, así que otra persona con cuenta no puede leer lo tuyo. No vendemos
        nada de esto ni lo usamos para entrenar modelos.
      </p>

      <h2 className="mt-10 font-serif text-[24px] font-normal leading-snug">
        Por eso los dos minutos del principio
      </h2>
      <p className="mt-3 text-[17px] leading-relaxed text-muted">
        Antes de que abras cualquier documento de tu trabajo, el profesor se detiene en qué no se
        pega nunca en un chat y cómo dejar anónimo lo que sí vas a usar. No es trámite: lo que
        pegues viaja a un tercero. Si tu trabajo tiene datos de clientes, pacientes o
        remuneraciones, esa parte de la clase es la más importante.
      </p>

      <h2 className="mt-10 font-serif text-[24px] font-normal leading-snug">Borrarlo</h2>
      <p className="mt-3 text-[17px] leading-relaxed text-muted">
        Escríbenos a{' '}
        <a
          href={`mailto:${PROFILE.email}`}
          className="underline underline-offset-2 hover:text-accent"
        >
          {PROFILE.email}
        </a>{' '}
        y borramos tu cuenta y todo lo que tenga tu nombre, incluido el audio y las transcripciones
        que queden en ElevenLabs. Lo hacemos con un comando, no a mano, así que no se nos escapa
        una tabla; toma un día o dos porque lo aprieta una persona, y te avisamos cuando esté.
        Sobrevive una cosa: si dejaste feedback sobre el producto, el texto se queda sin tu
        nombre ni tu cuenta asociada.
      </p>

      <p className="mt-12 border-t border-line pt-6 text-[15px] leading-relaxed text-soft">
        ¿Algo acá no calza con lo que ves?{' '}
        <Link href="/feedback" className="underline underline-offset-2 hover:text-accent">
          Dínoslo
        </Link>
        .
      </p>
    </section>
  );
}
