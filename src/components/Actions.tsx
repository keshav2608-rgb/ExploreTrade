"use client";

/**
 * Small client-side action buttons that call the API and refresh the
 * server-rendered page. Destructive ones ask for confirmation (SRS §8.4).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "./client";

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      after ? after() : router.refresh();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run, router };
}

export function DeleteButton({ path, confirmText, label = "Delete", redirectTo, className = "btn-danger" }: { path: string; confirmText: string; label?: string; redirectTo?: string; className?: string }) {
  const { busy, error, run, router } = useAction();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" className={className} disabled={busy} onClick={() => { if (window.confirm(confirmText)) run(() => api(path, { method: "DELETE" }), redirectTo ? () => { router.push(redirectTo); router.refresh(); } : undefined); }}>
        {busy ? "…" : label}
      </button>
      {error && <span role="alert" className="text-xs text-loss">{error}</span>}
    </span>
  );
}

export function WatchlistToggle({ instrumentId, watchlistItemId, symbol }: { instrumentId: string; watchlistItemId: string | null; symbol: string }) {
  const { busy, error, run } = useAction();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      {watchlistItemId ? (
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => run(() => api(`/api/watchlist/${watchlistItemId}`, { method: "DELETE" }))}>Remove from watchlist</button>
      ) : (
        <button type="button" className="btn-primary" disabled={busy} onClick={() => run(() => api("/api/watchlist", { method: "POST", body: JSON.stringify({ instrumentId }) }))}>Add {symbol} to watchlist</button>
      )}
      {error && <span role="alert" className="text-xs text-loss">{error}</span>}
    </span>
  );
}

export function AlertToggle({ id, isEnabled }: { id: string; isEnabled: boolean }) {
  const { busy, error, run } = useAction();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" className="btn-secondary" disabled={busy} onClick={() => run(() => api(`/api/alerts/${id}`, { method: "PATCH", body: JSON.stringify({ isEnabled: !isEnabled }) }))}>
        {isEnabled ? "Disable" : "Enable"}
      </button>
      {error && <span role="alert" className="text-xs text-loss">{error}</span>}
    </span>
  );
}

export function MarkReadButton({ id, isRead }: { id: string; isRead: boolean }) {
  const { busy, run } = useAction();
  return (
    <button type="button" className="btn-ghost text-xs" disabled={busy} onClick={() => run(() => api(`/api/notifications/${id}`, { method: "PATCH", body: JSON.stringify({ isRead: !isRead }) }))}>
      {isRead ? "Mark unread" : "Mark read"}
    </button>
  );
}

export function MarkAllReadButton() {
  const { busy, run } = useAction();
  return (
    <button type="button" className="btn-secondary" disabled={busy} onClick={() => run(() => api("/api/notifications/read-all", { method: "POST" }))}>
      Mark all read
    </button>
  );
}

export function RefreshButton() {
  const router = useRouter();
  return <button type="button" className="btn-secondary" onClick={() => router.refresh()}>Refresh quotes</button>;
}
