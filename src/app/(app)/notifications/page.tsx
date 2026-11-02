import Link from "next/link";
import { auth } from "@/lib/auth";
import { listNotifications } from "@/lib/services/alerts";
import { Card, EmptyState, PageHeader, formatDateTime } from "@/components/ui";
import { MarkAllReadButton, MarkReadButton } from "@/components/Actions";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await auth();
  const { page: pageRaw } = await searchParams;
  const page = Math.max(1, Number(pageRaw ?? 1) || 1);
  const n = await listNotifications(session!.user.id, page, 25);
  const pages = Math.max(1, Math.ceil(n.total / n.pageSize));

  return (
    <>
      <PageHeader title="Notifications" sub={`${n.unread} unread`} action={n.unread > 0 ? <MarkAllReadButton /> : undefined} />
      <Card>
        {n.rows.length === 0 ? (
          <EmptyState title="Nothing here yet" body="When a price alert triggers, it shows up here." action={<Link href="/alerts" className="btn-primary">Set up an alert</Link>} />
        ) : (
          <ul className="divide-y divide-line">
            {n.rows.map((r) => (
              <li key={r.id} className={`flex items-start justify-between gap-3 py-3 text-sm ${r.isRead ? "" : "font-medium"}`}>
                <div>
                  <div>{!r.isRead && <span aria-label="unread" className="mr-2 inline-block h-2 w-2 rounded-full bg-brand-600 align-middle" />}{r.title}</div>
                  <div className="mt-0.5 font-normal text-ink-muted">{r.message}</div>
                  <div className="mt-0.5 text-xs font-normal text-ink-faint">{formatDateTime(r.createdAt)}</div>
                </div>
                <MarkReadButton id={r.id} isRead={r.isRead} />
              </li>
            ))}
          </ul>
        )}
        {pages > 1 && (
          <nav className="mt-3 flex items-center gap-2 text-sm" aria-label="Pagination">
            {page > 1 && <Link href={`/notifications?page=${page - 1}`} className="btn-secondary">Previous</Link>}
            <span className="text-ink-muted">Page {page} of {pages}</span>
            {page < pages && <Link href={`/notifications?page=${page + 1}`} className="btn-secondary">Next</Link>}
          </nav>
        )}
      </Card>
    </>
  );
}
