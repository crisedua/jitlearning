import Image from 'next/image';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAccount } from '@/lib/account';

/**
 * Who you are signed in as, which plan you are on, and the way out.
 *
 * Server component: the session is read here and only the name, avatar and plan
 * label ever reach the browser.
 */
export async function SessionBar() {
  const account = await getAccount();
  if (!account) return null;

  const { profile, plan } = account;

  return (
    <div className="flex items-center gap-3 text-sm text-muted">
      {profile.avatar_url && (
        <Image
          src={profile.avatar_url}
          alt=""
          width={28}
          height={28}
          className="rounded-full border border-line"
          // Google serves these from lh3.googleusercontent.com; unoptimized
          // keeps the avatar out of the image pipeline and off next.config.
          unoptimized
        />
      )}
      <span className="max-w-[16rem] truncate">{profile.full_name ?? profile.email}</span>
      {plan && (
        <span className="rounded-full border border-line px-2 py-0.5 text-xs text-soft">
          {plan.name}
        </span>
      )}
      <form
        action={async () => {
          'use server';
          const supabase = await createClient();
          await supabase.auth.signOut();
          redirect('/');
        }}
      >
        <button
          type="submit"
          className="rounded-sm border-b border-transparent pb-0.5 transition-colors duration-200 ease-out hover:border-gold hover:text-ink"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
