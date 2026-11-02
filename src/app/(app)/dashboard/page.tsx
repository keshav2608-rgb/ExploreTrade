import Link from "next/link";
import { auth } from "@/lib/auth";
import { getPortfolio, getValuationHistory } from "@/lib/services/portfolio";
import { Card, DataStatusBadge, EmptyState, ErrorBox, Money, PageHeader, Percent, Stat, WarningBox, formatDateTime } from "@/components/ui";
import { AllocationChart, ContributorsChart, PortfolioChart } from "@/components/charts";
import { RefreshButton } from "@/components/Actions";
import { LiveTotals } from "@/components/LiveTotals";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;
  const [view, history] = await Promise.all([getPortfolio(userId), getValuationHistory(userId, 180)]);
  const s = view.summary;

  if (s.holdingsCount === 0 && view.closed.length === 0) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <EmptyState
          title="Add your first transaction"
          body="Record a stock you bought and the dashboard will show what you invested, what it is worth with the latest available quote, and your profit or loss."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/transactions/new" className="btn-primary">Add a transaction</Link>
              <Link href="/explore" className="btn-secondary">Explore stocks</Link>
            </div>
          }
        />
      </>
    );
  }

  const tone = (v: { isNegative(): boolean; isZero(): boolean } | null) => (v === null ? "neutral" : v.isNegative() ? "loss" : v.isZero() ? "neutral" : "gain");

  return (
    <>
      <PageHeader
        title="Dashboard"
        sub={
          s.valuationTimestamp ? (
            <>Valued using quotes as of {formatDateTime(s.valuationTimestamp)} · <DataStatusBadge status={view.dataStatus} isStale={s.staleCount > 0} provider={view.provider} /></>
          ) : (
            "No holding could be valued yet."
          )
        }
        action={<div className="flex gap-2"><RefreshButton /><Link href="/transactions/new" className="btn-primary">Add transaction</Link></div>}
      />

      {view.refreshError && <div className="mb-4"><ErrorBox title="Quotes could not be refreshed" body={<>The market-data provider did not answer ({view.refreshError}). Values below use the last stored quotes, marked stale where older than the freshness limit.</>} /></div>}
      {s.unvaluedCount > 0 && <div className="mb-4"><WarningBox>{s.unvaluedCount} holding{s.unvaluedCount > 1 ? "s have" : " has"} no quote yet and {s.unvaluedCount > 1 ? "are" : "is"} left out of the totals. A missing quote is never counted as zero.</WarningBox></div>}
      {s.staleCount > 0 && !view.refreshError && <div className="mb-4"><WarningBox>{s.staleCount} quote{s.staleCount > 1 ? "s are" : " is"} older than the freshness limit. Totals may not reflect the current price.</WarningBox></div>}

      <LiveTotals initial={{ marketValue: s.marketValue?.toString() ?? null, unrealizedPnl: s.unrealizedPnl?.toString() ?? null }} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Invested (open holdings)" value={<Money value={s.investedValue} />} sub="Remaining cost basis, buy charges included" />
        <Stat label="Current value" value={<Money value={s.marketValue} />} sub={s.valuedCount < s.holdingsCount ? `${s.valuedCount} of ${s.holdingsCount} holdings valued` : `${s.holdingsCount} holding${s.holdingsCount === 1 ? "" : "s"}`} />
        <Stat label="Total P&L" value={<Money value={s.totalPnl} signed />} sub={<>Return <Percent value={s.returnPercent} /> on all buys</>} tone={tone(s.totalPnl)} />
        <Stat label="Today" value={<Money value={s.dayChange} signed />} sub={s.dayChange === null ? "Needs a previous close for every valued holding" : <Percent value={s.dayChangePercent} />} tone={tone(s.dayChange)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Holdings" className="lg:col-span-2" action={<Link href="/portfolio" className="text-sm">View all</Link>}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Stock</th><th className="text-right">Qty</th><th className="text-right">Avg buy</th><th className="text-right">Last price</th><th className="text-right">Value</th><th className="text-right">P&L</th></tr></thead>
              <tbody>
                {view.holdings.slice(0, 8).map((h) => (
                  <tr key={h.instrumentId}>
                    <td><Link href={`/stocks/${h.instrument.id}`} className="font-medium text-ink no-underline hover:underline">{h.instrument.symbol}</Link><div className="text-xs text-ink-muted">{h.instrument.companyName}</div></td>
                    <td className="text-right num">{h.quantity.toString()}</td>
                    <td className="text-right"><Money value={h.averageBuyPrice} /></td>
                    <td className="text-right">{h.storedQuote ? <><Money value={h.storedQuote.price} />{h.storedQuote.isStale && <span className="ml-1 pill bg-amber-100 text-amber-800">stale</span>}</> : <span className="text-ink-faint">no quote</span>}</td>
                    <td className="text-right"><Money value={h.currentValue} /></td>
                    <td className="text-right"><Money value={h.totalPnl} signed /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Today's movers in your portfolio">
          {view.contributors.gainers.length + view.contributors.losers.length === 0 ? (
            <p className="text-sm text-ink-muted">Shown once every valued holding has a previous close to compare with.</p>
          ) : (
            <>
              <ContributorsChart data={[...view.contributors.gainers, ...view.contributors.losers].map((h) => ({ label: h.instrument.symbol, value: Number(h.dayChange!.toFixed(2)) }))} />
              <ul className="mt-2 space-y-1 text-sm">
                {[...view.contributors.gainers, ...view.contributors.losers].map((h) => (
                  <li key={h.instrumentId} className="flex justify-between"><span>{h.instrument.symbol}</span><Money value={h.dayChange} signed /></li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-muted">Day change = quantity × (latest price − previous close), from the quote shown on each stock page. It describes today's move, not where the price will go next.</p>
            </>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Portfolio value over time">
          {history.length < 2 ? (
            <p className="text-sm text-ink-muted">A valuation is recorded once a day by the alert worker (<code>npm run worker</code>). The chart appears after two or more days of data.</p>
          ) : (
            <PortfolioChart data={history.map((v) => ({ t: v.valuationTimestamp.toISOString(), marketValue: Number(v.marketValue), investedValue: Number(v.investedValue) }))} />
          )}
        </Card>
        <Card title="Allocation">
          <div className="space-y-6">
            <AllocationChart title="By holding (current value, or cost where no quote)" data={view.allocation.map((a) => ({ label: a.label, value: Number(a.value), percent: Number(a.percent) }))} />
            <AllocationChart title="By sector" data={view.sectorAllocation.map((a) => ({ label: a.label, value: Number(a.value), percent: Number(a.percent) }))} />
          </div>
        </Card>
      </div>

      <p className="mt-6 text-xs text-ink-muted">
        How these numbers are calculated: weighted-average cost per stock; buy charges are added to cost, sell charges reduce proceeds; realized P&L is booked on each sell; unrealized P&L is current value minus remaining cost; return % divides total P&L by the cost of every buy you have made. Not a tax or broker statement.
      </p>
    </>
  );
}
