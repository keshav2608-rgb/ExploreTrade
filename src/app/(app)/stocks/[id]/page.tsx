import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { HttpError } from "@/lib/errors";
import { getInstrumentDetail, getInstrumentHistory } from "@/lib/services/instruments";
import { isWatched } from "@/lib/services/watchlist";
import { prisma } from "@/lib/prisma";
import { Card, DataStatusBadge, ErrorBox, Money, PageHeader, Percent, WarningBox, formatDateTime } from "@/components/ui";
import { PriceChart } from "@/components/charts";
import { WatchlistToggle } from "@/components/Actions";
import { AlertForm } from "@/components/AlertForm";
import { historyRangeSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export default async function StockPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ range?: string }> }) {
  const session = await auth();
  const { id } = await params;
  const { range: rangeRaw } = await searchParams;
  const range = historyRangeSchema.safeParse(rangeRaw ?? undefined).data ?? "3M";

  let detail;
  try {
    detail = await getInstrumentDetail(id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  const [history, watchlistItemId, alerts] = await Promise.all([
    getInstrumentHistory(id, range),
    isWatched(session!.user.id, id),
    prisma.priceAlert.findMany({ where: { userId: session!.user.id, instrumentId: id }, orderBy: { createdAt: "desc" } }),
  ]);
  const { instrument, quote, refreshError } = detail;

  return (
    <>
      <PageHeader
        title={`${instrument.symbol} · ${instrument.companyName}`}
        sub={<>{instrument.exchange}{instrument.sector ? ` · ${instrument.sector}` : ""}</>}
        action={<div className="flex flex-wrap gap-2"><WatchlistToggle instrumentId={instrument.id} watchlistItemId={watchlistItemId} symbol={instrument.symbol} /><Link href={`/transactions/new?instrument=${instrument.id}`} className="btn-secondary">Add transaction</Link></div>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Latest quote">
          {quote ? (
            <>
              <div className="text-3xl font-semibold num"><Money value={quote.price} /></div>
              <div className="mt-1 text-sm"><Money value={quote.dayChange} signed /> <Percent value={quote.dayChangePercent} /> <span className="text-ink-muted">today</span></div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-ink-muted">Previous close</dt><dd className="text-right"><Money value={quote.previousClose} /></dd>
                <dt className="text-ink-muted">Volume</dt><dd className="text-right num">{quote.volume === null ? "—" : Number(quote.volume).toLocaleString("en-IN")}</dd>
                <dt className="text-ink-muted">Quote time</dt><dd className="text-right">{formatDateTime(quote.quoteTimestamp)}</dd>
                <dt className="text-ink-muted">Fetched</dt><dd className="text-right">{formatDateTime(quote.fetchedAt)}</dd>
              </dl>
              <div className="mt-3"><DataStatusBadge status={quote.dataStatus} isStale={quote.isStale} provider={quote.provider} /></div>
              {quote.isStale && <div className="mt-3"><WarningBox>This quote is older than the freshness limit. The latest refresh {refreshError ? `failed: ${refreshError}` : "did not return a newer price"}.</WarningBox></div>}
            </>
          ) : (
            <ErrorBox title="No quote available" body={refreshError ? `The provider did not answer: ${refreshError}. Nothing is stored for this stock yet, so no value is shown rather than a wrong one.` : "No quote has been retrieved for this stock yet."} retryHref={`/stocks/${instrument.id}`} />
          )}
        </Card>

        <Card title="Price history" className="lg:col-span-2" action={
          <nav className="flex gap-1" aria-label="Range">
            {(["1M", "3M", "6M", "1Y"] as const).map((r) => <Link key={r} href={`/stocks/${instrument.id}?range=${r}`} className={`rounded-md px-2 py-1 text-xs no-underline ${r === range ? "bg-brand-50 text-brand-700 font-medium" : "text-ink-muted hover:bg-canvas"}`} aria-current={r === range ? "true" : undefined}>{r}</Link>)}
          </nav>
        }>
          {history.candles.length === 0 ? (
            <ErrorBox title="Chart unavailable" body={history.error ?? "The provider returned no history for this range."} />
          ) : (
            <>
              <PriceChart label={`${instrument.symbol} ${range}`} data={history.candles.map((c) => ({ t: c.timestamp.toISOString(), close: Number(c.close) }))} />
              <div className="mt-2 text-xs"><DataStatusBadge status={history.status} /> <span className="text-ink-muted">daily closes</span></div>
            </>
          )}
        </Card>
      </div>

      <Card title="Price alerts for this stock" className="mt-4">
        {alerts.length > 0 && (
          <ul className="mb-4 space-y-1 text-sm">
            {alerts.map((a) => <li key={a.id}>Notify when price goes {a.condition.toLowerCase()} <Money value={a.thresholdPrice.toString()} /> · {a.isEnabled ? "enabled" : "disabled"}{a.lastTriggeredAt ? ` · last triggered ${formatDateTime(a.lastTriggeredAt)}` : ""} · <Link href="/alerts">manage</Link></li>)}
          </ul>
        )}
        <AlertForm instrument={{ id: instrument.id, symbol: instrument.symbol, companyName: instrument.companyName, exchange: instrument.exchange, sector: instrument.sector }} />
      </Card>
    </>
  );
}
