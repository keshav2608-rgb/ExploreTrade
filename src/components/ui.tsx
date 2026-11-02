/**
 * Small presentational building blocks. Kept in one file on purpose: the
 * project does not need a component library for a dozen primitives.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { formatInr, formatPercent, type DecimalInput } from "@/lib/money";

export function Card({ children, className = "", title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={`card card-pad ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          {title && <h2>{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** A headline figure with a label (dashboard totals). */
export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "gain" | "loss" | "neutral" }) {
  const toneClass = tone === "gain" ? "gain" : tone === "loss" ? "loss" : "";
  return (
    <div className="card card-pad">
      <div className="text-sm text-ink-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold num ${toneClass}`}>{value}</div>
      {sub && <div className="mt-1 text-sm text-ink-muted">{sub}</div>}
    </div>
  );
}

/** Signed rupee amount coloured by sign; the sign makes it readable without colour. */
export function Money({ value, signed = false, className = "" }: { value: DecimalInput | null | undefined; signed?: boolean; className?: string }) {
  if (value === null || value === undefined) return <span className={`text-ink-faint ${className}`}>—</span>;
  const s = formatInr(value, { signed });
  const tone = signed ? (s.startsWith("+") ? "gain" : s.startsWith("-") ? "loss" : "") : "";
  return <span className={`num ${tone} ${className}`}>{s}</span>;
}

export function Percent({ value, className = "" }: { value: DecimalInput | null | undefined; className?: string }) {
  if (value === null || value === undefined) return <span className={`text-ink-faint ${className}`}>—</span>;
  const s = formatPercent(value);
  const tone = s.startsWith("+") ? "gain" : s.startsWith("-") ? "loss" : "";
  return <span className={`num ${tone} ${className}`}>{s}</span>;
}

/** Quote provenance label (FR-STK-05, FR-DATA-02). */
export function DataStatusBadge({ status, isStale, provider }: { status: string | null | undefined; isStale?: boolean; provider?: string | null }) {
  if (!status) return <span className="pill bg-canvas text-ink-muted">No quote</span>;
  const label: Record<string, string> = { LIVE: "Live", DELAYED: "Delayed", END_OF_DAY: "End of day", CACHED: "Cached", DEMO: "Demo data", TEST: "Test quote" };
  const cls: Record<string, string> = { LIVE: "bg-gain-soft text-gain", DELAYED: "bg-amber-100 text-amber-800", END_OF_DAY: "bg-canvas text-ink-muted", CACHED: "bg-canvas text-ink-muted", DEMO: "bg-violet-100 text-violet-800", TEST: "bg-violet-100 text-violet-800" };
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`pill ${cls[status] ?? "bg-canvas text-ink-muted"}`}>{label[status] ?? status}</span>
      {isStale && <span className="pill bg-amber-100 text-amber-800">Stale</span>}
      {provider && <span className="text-xs text-ink-faint">via {provider}</span>}
    </span>
  );
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) + " IST";
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "UTC" });
}

// ---- states (SRS §8.5) -----------------------------------------------------

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line bg-white px-6 py-10 text-center">
      <h3>{title}</h3>
      {body && <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ title = "Something did not load", body, retryHref }: { title?: string; body: ReactNode; retryHref?: string }) {
  return (
    <div role="alert" className="rounded-card border border-loss/30 bg-loss-soft px-4 py-3 text-sm">
      <div className="font-medium text-loss">{title}</div>
      <div className="mt-1 text-ink">{body}</div>
      {retryHref && (
        <Link href={retryHref} className="mt-2 inline-block text-sm">
          Try again
        </Link>
      )}
    </div>
  );
}

export function WarningBox({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="rounded-card border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {children}
    </div>
  );
}

export function InfoBox({ children }: { children: ReactNode }) {
  return <div className="rounded-card border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-ink">{children}</div>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-line ${className}`} />;
}

export function PageHeader({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1>{title}</h1>
        {sub && <p className="mt-1 text-sm text-ink-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
