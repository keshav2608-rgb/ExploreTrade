import Link from "next/link";
import { auth } from "@/lib/auth";
import { listWatchlist } from "@/lib/services/watchlist";
import { Card, DataStatusBadge, EmptyState, Money, PageHeader, Percent, WarningBox } from "@/components/ui";
import { DeleteButton } from "@/components/Actions";
import { D } from "@/lib/money";

export const metadata = { title: "Watchlist" };
export const dynamic = "force-dynamic";

type Sort = "name" | "change" | "percent";

export default async function WatchlistPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const session = await auth();
  const { sort: sortRaw } = await searchParams;
  const sort: Sort = sortRaw === "change" || sortRaw === "percent" ? sortRaw : "name";
  const { items, refreshError } = await listWatchlist(session!.user.id);

  const sorted = [...items].sort((a, b) => {
    if (sort === "name") return a.instrument.symbol.localeCompare(b.instrument.symbol);
    const key = sort === "change" ? "dayChange" : "dayChangePercent";
    const av = a.quote?.[key] ?? null, bv = b.quote?.[key] ?? null;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return D(bv).comparedTo(D(av));
  });

  return (
    <>
      <PageHeader title="Watchlist" sub="Stocks you follow, whether or not you own them." action={<Link href="/explore" className="btn-primary">Find stocks</Link>} />
      {refreshError && <div className="mb-4"><WarningBox>Quote refresh failed ({refreshError}); showing stored quotes.</WarningBox></div>}
      <Card action={
        <nav className="flex gap-1 text-xs" aria-label="Sort">
          {(["name", "change", "percent"] as const).map((s) => <Link key={s} href={`/watchlist?sort=${s}`} className={`rounded-md px-2 py-1 no-underline ${s === sort ? "bg-brand-50 text-brand-700 font-medium" : "text-ink-muted hover:bg-canvas"}`}>{s === "name" ? "Name" : s === "change" ? "Change ₹" : "Change %"}</Link>)}
        </nav>
      }>
        {sorted.length === 0 ? (
          <EmptyState title="Your watchlist is empty" body="Open any stock and choose “Add to watchlist”. You will see its latest price and daily change here." action={<Link href="/explore" className="btn-primary">Explore stocks</Link>} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Stock</th><th className="text-right">Last price</th><th className="text-right">Change</th><th>Data</th><th></th></tr></thead>
              <tbody>
                {sorted.map((w) => (
                  <tr key={w.id}>
                    <td><Link href={`/stocks/${w.instrument.id}`} className="font-medium text-ink no-underline hover:underline">{w.instrument.symbol}</Link><div className="text-xs text-ink-muted">{w.instrument.companyName}</div></td>
                    <td className="text-right"><Money value={w.quote?.price ?? null} /></td>
                    <td className="text-right">{w.quote ? <><Money value={w.quote.dayChange} signed /> <Percent value={w.quote.dayChangePercent} /></> : <span className="text-ink-faint">—</span>}</td>
                    <td><DataStatusBadge status={w.quote?.dataStatus} isStale={w.quote?.isStale} /></td>
                    <td className="text-right"><Link href={`/stocks/${w.instrument.id}`} className="btn-ghost text-xs">Alert</Link> <DeleteButton path={`/api/watchlist/${w.id}`} confirmText={`Remove ${w.instrument.symbol} from your watchlist?`} label="Remove" className="btn-ghost text-xs text-loss" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
