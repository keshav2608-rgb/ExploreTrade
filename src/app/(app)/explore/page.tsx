import Link from "next/link";
import { getMarketOverview, searchInstruments } from "@/lib/services/instruments";
import { Card, DataStatusBadge, ErrorBox, Money, PageHeader, Percent, WarningBox, formatDateTime } from "@/components/ui";

export const metadata = { title: "Explore" };
export const dynamic = "force-dynamic";

/** Search + market overview (SRS §6.6). Movers are among the supported set, and say so. */
export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const [results, market] = await Promise.all([searchInstruments(q, 20), getMarketOverview()]);

  return (
    <>
      <PageHeader title="Explore" sub="Search supported stocks, or look at what moved today." />
      <form className="mb-6 flex gap-2" action="/explore" method="get" role="search">
        <label htmlFor="q" className="sr-only">Search stocks</label>
        <input id="q" name="q" defaultValue={q} className="input max-w-md" placeholder="Symbol or company name" />
        <button type="submit" className="btn-primary">Search</button>
      </form>

      <Card title={q ? `Results for “${q}”` : "Supported stocks"} className="mb-4">
        {results.length === 0 ? (
          <p className="text-sm text-ink-muted">No supported stock matches. This release covers {market.universe} NSE-listed companies.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((r) => (
              <li key={r.id}><Link href={`/stocks/${r.id}`} className="block rounded-lg border border-line px-3 py-2 text-ink no-underline hover:bg-canvas"><span className="font-medium">{r.symbol}</span> <span className="text-xs text-ink-muted">{r.exchange}</span><div className="text-sm text-ink-muted">{r.companyName}</div></Link></li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Indices">
          {market.indicesError && <ErrorBox body={`Indices unavailable: ${market.indicesError}`} />}
          {!market.indicesError && market.indices.length === 0 && <p className="text-sm text-ink-muted">The configured provider does not supply index values.</p>}
          <ul className="space-y-2">
            {market.indices.map((i) => (
              <li key={i.name} className="flex items-baseline justify-between text-sm"><span>{i.name}</span><span className="text-right"><span className="num font-medium">{Number(i.price).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span> <Percent value={i.dayChangePercent} /><div className="text-xs"><DataStatusBadge status={i.dataStatus} /></div></span></li>
            ))}
          </ul>
        </Card>
        <Card title="Top gainers today">
          <Movers rows={market.gainers} />
        </Card>
        <Card title="Top losers today">
          <Movers rows={market.losers} />
        </Card>
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        Gainers and losers are ranked among the {market.universe} supported stocks ({market.covered} with a quote), by the provider's day-change percentage{market.asOf ? `, quotes as of ${formatDateTime(market.asOf)}` : ""}. <DataStatusBadge status={market.status} /> Market session state is not shown because the provider does not report it reliably.
      </p>
      {market.refreshError && <div className="mt-3"><WarningBox>Quote refresh failed ({market.refreshError}); showing stored quotes.</WarningBox></div>}
    </>
  );
}

function Movers({ rows }: { rows: Array<{ instrument: { id: string; symbol: string; companyName: string }; quote: { price: string; dayChangePercent: string | null; isStale: boolean } }> }) {
  if (rows.length === 0) return <p className="text-sm text-ink-muted">Nothing to rank yet.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.instrument.id} className="flex items-center justify-between text-sm">
          <Link href={`/stocks/${r.instrument.id}`} className="text-ink no-underline hover:underline"><span className="font-medium">{r.instrument.symbol}</span><div className="text-xs text-ink-muted">{r.instrument.companyName}</div></Link>
          <span className="text-right"><Money value={r.quote.price} /><div><Percent value={r.quote.dayChangePercent} />{r.quote.isStale && <span className="ml-1 text-xs text-amber-800">stale</span>}</div></span>
        </li>
      ))}
    </ul>
  );
}
