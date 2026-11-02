import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

/** Public landing page (SRS §8.2). Logged-in users go straight to the dashboard. */
export default async function LandingPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
      <header className="flex items-center justify-between">
        <span className="text-lg font-semibold">PortfolioPulse</span>
        <nav className="flex gap-2">
          <Link href="/login" className="btn-secondary">Log in</Link>
          <Link href="/register" className="btn-primary">Create account</Link>
        </nav>
      </header>

      <section className="mt-14 grid gap-10 md:grid-cols-2 md:items-center">
        <div>
          <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">Your stocks, your returns, one calm page.</h1>
          <p className="mt-4 text-ink-muted">
            Record what you bought and sold, see what it is worth with the latest available quote, follow the
            stocks you care about, and get told when a price crosses a line you set. Built for people who are
            new to investing in Indian equities.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/register" className="btn-primary">Start tracking</Link>
            <Link href="/login" className="btn-secondary">I have an account</Link>
          </div>
          <p className="mt-4 text-xs text-ink-faint">
            A demo account is seeded for trying things out: <code>demo@portfoliopulse.local</code> / <code>demo12345</code>.
          </p>
        </div>
        <ul className="card card-pad space-y-4 text-sm">
          <li><strong>Holdings and P&amp;L</strong><br /><span className="text-ink-muted">Weighted-average cost, realized and unrealized profit, shown with the quote time it was valued at.</span></li>
          <li><strong>Watchlist and price alerts</strong><br /><span className="text-ink-muted">Follow stocks you do not own yet; get an in-app notification when a price goes above or below your level.</span></li>
          <li><strong>Honest about data</strong><br /><span className="text-ink-muted">Every price shows its source and age. Delayed data is labelled delayed, demo data is labelled demo, and a missing quote is never shown as zero.</span></li>
          <li><strong>Not a broker</strong><br /><span className="text-ink-muted">No trades are placed and no advice is given. Values are estimates from your own entries and the latest available market data.</span></li>
        </ul>
      </section>

      <footer className="mt-16 border-t border-line pt-6 text-xs text-ink-faint">
        PortfolioPulse is a portfolio tracking and financial-education project. It does not execute trades, provide investment advice,
        guarantee quote accuracy or predict market performance. <Link href="/privacy">Privacy notice</Link>
      </footer>
    </main>
  );
}
