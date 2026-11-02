import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NavLinks } from "@/components/NavLinks";
import { SignOutButton } from "@/components/SignOutButton";

/**
 * Shell for every private page: top navigation on small screens, sidebar
 * on wide ones (SRS §8.3). The middleware already guarantees a session;
 * the unread-notification count is read here so the badge is always right.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = session!.user.id;
  const [unread, user] = await Promise.all([
    prisma.notification.count({ where: { userId, isRead: false } }),
    prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } }),
  ]);
  const provider = (process.env.MARKET_DATA_PROVIDER ?? "demo").toLowerCase();
  if (!user) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1>This account no longer exists</h1>
        <p className="mt-2 text-sm text-ink-muted">Your login session refers to an account that was deleted. Log out to continue.</p>
        <div className="mt-4 flex justify-center"><SignOutButton className="btn-primary" /></div>
      </main>
    );
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-b border-line bg-white md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-3 md:block md:px-5 md:py-5">
          <Link href="/dashboard" className="text-lg font-semibold text-ink no-underline">PortfolioPulse</Link>
          <div className="text-xs text-ink-muted md:mt-1">Hi, {user?.displayName ?? "there"}</div>
        </div>
        <NavLinks unread={unread} />
        <div className="hidden px-5 pb-5 md:block">
          <SignOutButton />
        </div>
      </aside>
      <div className="min-w-0">
        {provider === "demo" && (
          <div className="border-b border-violet-200 bg-violet-50 px-4 py-2 text-center text-xs text-violet-900">
            Demo data: prices are generated fixtures, not real market quotes. Set <code>MARKET_DATA_PROVIDER=yahoo</code> in <code>.env</code> for delayed real quotes.
          </div>
        )}
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-ink-faint sm:px-6">
          Values are estimates from your entries and the latest available quotes. Not investment advice. <Link href="/privacy">Privacy</Link>
        </footer>
      </div>
    </div>
  );
}
