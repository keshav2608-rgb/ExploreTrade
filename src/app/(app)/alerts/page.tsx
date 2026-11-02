import Link from "next/link";
import { auth } from "@/lib/auth";
import { listAlerts } from "@/lib/services/alerts";
import { Card, EmptyState, InfoBox, Money, PageHeader, formatDateTime } from "@/components/ui";
import { AlertToggle, DeleteButton } from "@/components/Actions";
import { AlertForm } from "@/components/AlertForm";
import { AlertEditor } from "@/components/AlertEditor";

export const metadata = { title: "Alerts" };
export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const session = await auth();
  const alerts = await listAlerts(session!.user.id);

  return (
    <>
      <PageHeader title="Price alerts" sub="Get an in-app notification when a stock goes above or below a price you choose." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Your alerts" className="lg:col-span-2">
          {alerts.length === 0 ? (
            <EmptyState title="No alerts yet" body="Create one on the right, or from any stock page." />
          ) : (
            <ul className="divide-y divide-line">
              {alerts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                  <div>
                    <Link href={`/stocks/${a.instrument.id}`} className="font-medium text-ink no-underline hover:underline">{a.instrument.symbol}</Link> goes <strong>{a.condition.toLowerCase()}</strong> <Money value={a.thresholdPrice.toString()} />
                    <div className="text-xs text-ink-muted">
                      Latest: {a.quote ? <Money value={a.quote.price} /> : "no quote"} · {a.isEnabled ? (a.isTriggered ? "condition currently true (will re-arm when price crosses back)" : "armed") : "disabled"}
                      {a.lastTriggeredAt && <> · last triggered {formatDateTime(a.lastTriggeredAt)}</>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <AlertEditor alert={{ id: a.id, condition: a.condition as "ABOVE" | "BELOW", thresholdPrice: a.thresholdPrice.toString() }} />
                    <AlertToggle id={a.id} isEnabled={a.isEnabled} />
                    <DeleteButton path={`/api/alerts/${a.id}`} confirmText={`Delete the ${a.instrument.symbol} alert?`} className="btn-ghost text-loss" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-4">
          <Card title="New alert"><AlertForm /></Card>
          <InfoBox>Alerts are evaluated by the scheduled worker (<code>npm run worker</code>, every {process.env.WORKER_INTERVAL_SECONDS ?? 300} s) against the latest available quote. An alert fires once per crossing: it will not repeat on every check while the price stays beyond your level.</InfoBox>
        </div>
      </div>
    </>
  );
}
