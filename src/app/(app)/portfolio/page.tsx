import Link from "next/link";
import { auth } from "@/lib/auth";
import { getPortfolio } from "@/lib/services/portfolio";
import { listTransactions } from "@/lib/services/transactions";
import { Card, DataStatusBadge, EmptyState, ErrorBox, Money, PageHeader, Percent, formatDate, formatDateTime } from "@/components/ui";
import { DeleteButton } from "@/components/Actions";

export const metadata = { title: "Portfolio" };
export const dynamic = "force-dynamic";

export default async function PortfolioPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await auth();
  const userId = session!.user.id;
  const { page: pageRaw } = await searchParams;
  const page = Math.max(1, Number(pageRaw ?? 1) || 1);
  const [view, txs] = await Promise.all([getPortfolio(userId), listTransactions(userId, page, 25)]);
  const s = view.summary;
  const pages = Math.max(1, Math.ceil(txs.total / txs.pageSize));

  return (
    <>
      <PageHeader title="Portfolio" sub={s.valuationTimestamp ? <>Quotes as of {formatDateTime(s.valuationTimestamp)} · <DataStatusBadge status={view.dataStatus} isStale={s.staleCount > 0} provider={view.provider} /></> : undefined} action={<div className="flex gap-2"><a href="/api/transactions/export" className="btn-secondary">Export CSV</a><Link href="/transactions/new" className="btn-primary">Add transaction</Link></div>} />
      {view.refreshError && <div className="mb-4"><ErrorBox title="Quotes could not be refreshed" body={`Provider error: ${view.refreshError}. Showing last stored quotes.`} /></div>}

      <Card title="Holdings">
        {view.holdings.length === 0 ? (
          <EmptyState title="No open holdings" body="Buy transactions you record will appear here with their current value." action={<Link href="/transactions/new" className="btn-primary">Add a transaction</Link>} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Stock</th><th className="text-right">Qty</th><th className="text-right">Avg buy</th><th className="text-right">Invested</th><th className="text-right">Last price</th><th className="text-right">Value</th><th className="text-right">Unrealized</th><th className="text-right">Realized</th><th className="text-right">Total P&L</th></tr></thead>
              <tbody>
                {view.holdings.map((h) => (
                  <tr key={h.instrumentId}>
                    <td><Link href={`/stocks/${h.instrument.id}`} className="font-medium text-ink no-underline hover:underline">{h.instrument.symbol}</Link><div className="text-xs text-ink-muted">{h.instrument.companyName}</div></td>
                    <td className="text-right num">{h.quantity.toString()}</td>
                    <td className="text-right"><Money value={h.averageBuyPrice} /></td>
                    <td className="text-right"><Money value={h.costBasis} /></td>
                    <td className="text-right">{h.storedQuote ? <><Money value={h.storedQuote.price} /><div className="text-xs"><DataStatusBadge status={h.storedQuote.dataStatus} isStale={h.storedQuote.isStale} /></div></> : <span className="text-ink-faint">no quote</span>}</td>
                    <td className="text-right"><Money value={h.currentValue} /></td>
                    <td className="text-right"><Money value={h.unrealizedPnl} signed /></td>
                    <td className="text-right"><Money value={h.realizedPnl} signed /></td>
                    <td className="text-right"><Money value={h.totalPnl} signed />{h.totalPnl !== null && h.totalBuyCost.gt(0) && <div className="text-xs"><Percent value={h.totalPnl.div(h.totalBuyCost).times(100)} /></div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {view.closed.length > 0 && (
          <div className="mt-4 text-sm text-ink-muted">
            Closed positions: {view.closed.map((c) => <span key={c.instrumentId} className="mr-3">{c.instrument.symbol} <Money value={c.realizedPnl} signed /></span>)}
          </div>
        )}
      </Card>

      <Card title="Transactions" className="mt-4" action={<span className="text-sm text-ink-muted">{txs.total} total</span>}>
        {txs.rows.length === 0 ? (
          <EmptyState title="No transactions yet" action={<Link href="/transactions/new" className="btn-primary">Add a transaction</Link>} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Stock</th><th>Type</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Charges</th><th className="text-right">Net cash</th><th>Notes</th><th></th></tr></thead>
              <tbody>
                {txs.rows.map((t) => {
                  const gross = t.quantity.mul(t.pricePerShare);
                  const net = t.type === "BUY" ? gross.add(t.charges) : gross.sub(t.charges);
                  return (
                    <tr key={t.id}>
                      <td className="num">{formatDate(t.tradeDate)}</td>
                      <td><Link href={`/stocks/${t.instrument.id}`} className="text-ink no-underline hover:underline">{t.instrument.symbol}</Link></td>
                      <td><span className={`pill ${t.type === "BUY" ? "bg-gain-soft text-gain" : "bg-loss-soft text-loss"}`}>{t.type === "BUY" ? "Buy" : "Sell"}</span></td>
                      <td className="text-right num">{t.quantity.toString()}</td>
                      <td className="text-right"><Money value={t.pricePerShare.toString()} /></td>
                      <td className="text-right"><Money value={t.charges.toString()} /></td>
                      <td className="text-right"><Money value={net.toString()} /></td>
                      <td className="max-w-[200px] truncate text-ink-muted">{t.notes}</td>
                      <td className="text-right"><Link href={`/transactions/${t.id}/edit`} className="btn-ghost text-xs">Edit</Link> <DeleteButton path={`/api/transactions/${t.id}`} confirmText={`Delete this ${t.type.toLowerCase()} of ${t.quantity.toString()} ${t.instrument.symbol}? Holdings will be recalculated.`} className="btn-ghost text-xs text-loss" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <nav className="mt-3 flex items-center gap-2 text-sm" aria-label="Pagination">
            {page > 1 && <Link href={`/portfolio?page=${page - 1}`} className="btn-secondary">Previous</Link>}
            <span className="text-ink-muted">Page {page} of {pages}</span>
            {page < pages && <Link href={`/portfolio?page=${page + 1}`} className="btn-secondary">Next</Link>}
          </nav>
        )}
      </Card>
    </>
  );
}
