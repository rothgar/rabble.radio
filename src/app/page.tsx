import { redirect } from 'next/navigation';
import { AuthButton } from '@/components/AuthButton';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) {
    redirect('/spaces');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-5xl font-bold tracking-tight">Rabble</h1>
      <p className="max-w-md text-center text-slate-300">
        Live audio spaces for Bluesky. Create a room, invite speakers, and let
        the audience listen in.
      </p>
      <AuthButton />
    </main>
  );
}
