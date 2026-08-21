import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { checkAdmin } from '@/lib/admin';
import { signInPath } from '@/lib/paths';
import { NotAdmin } from '@/components/NotAdmin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Operación · ModoJIT',
  robots: { index: false, follow: false },
};

/**
 * The door to the operator pages, which did not have one.
 *
 * Six pages had grown under `/admin` and the only ways in were typing a URL
 * from memory or finding one of the links they had started leaving for each
 * other — `/admin/estado` pointing at three of them, `/admin/feedback` at one.
 * A set of tools whose index is "the ones I remember" is a set of tools where
 * the forgotten one stops being read, and the forgotten one here was whichever
 * happened to answer the question nobody had asked yet.
 *
 * Deliberately just a list. Every number worth watching already has a page that
 * explains it in context, and a dashboard summarising them here would be a
 * seventh surface to keep agreeing with the other six.
 */
const PAGES: readonly { href: string; name: string; what: string }[] = [
  {
    href: '/admin/usuarios',
    name: 'Usuarios',
    what: 'Quién tiene cuenta, en qué plan, cuántas clases lleva y si le quedaron guardadas.',
  },
  {
    href: '/admin/estado',
    name: 'Estado',
    what: 'Qué le falta a este despliegue. Lo que está puesto y lo que no, sin mostrar ningún valor.',
  },
  {
    href: '/admin/embudo',
    name: 'Embudo',
    what: 'Qué hizo la gente: quién llegó, quién habló, quién volvió.',
  },
  {
    href: '/admin/feedback',
    name: 'Feedback',
    what: 'Lo que escribieron, y el botón que cumple el trato de meses de Fundador.',
  },
  {
    href: '/admin/costos',
    name: 'Costos',
    what: 'Qué cuesta tener esto andando, y qué costaría con más gente.',
  },
  {
    href: '/admin/radar',
    name: 'Radar',
    what: 'Qué puede encontrar el profesor cuando busca algo actual.',
  },
];

export default async function AdminIndex() {
  const gate = await checkAdmin();
  if (!gate.ok && gate.reason === 'anonymous') redirect(signInPath('/admin'));
  if (!gate.ok) return <NotAdmin email={gate.email} path="/admin" />;

  return (
    <main className="mx-auto max-w-[52rem] px-6 py-12 lg:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Operación</p>
      <h1 className="mt-3 font-serif text-[clamp(1.75rem,4vw,2.5rem)] font-normal leading-[1.08] tracking-[-0.02em]">
        Las páginas de adentro
      </h1>
      <p className="mt-3 text-[17px] leading-relaxed text-muted">
        Entraste como {gate.email}.
      </p>

      <ul className="mt-10 divide-y divide-line border-y border-line">
        {PAGES.map((page) => (
          <li key={page.href}>
            <Link
              href={page.href}
              className="group flex flex-col gap-1 py-5 transition-colors duration-150 ease-out"
            >
              <span className="flex items-center gap-2 text-[17px] font-medium text-ink transition-colors duration-150 ease-out group-hover:text-accent">
                {page.name}
                <span aria-hidden className="text-accent">
                  →
                </span>
              </span>
              <span className="text-[15px] leading-relaxed text-muted">{page.what}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
