"use client";

/**
 * Live portfolio totals via the optional PulseFeed WebSocket service.
 *
 * When PulseFeed is running (see services/pulsefeed), the browser opens a
 * WebSocket to it with a short-lived token from /api/live-token and
 * receives a `portfolio` message whenever a quote for one of this user's
 * holdings changes. The strip then shows the live current value and
 * unrealized P&L with the time of the last update.
 *
 * When PulseFeed is not running (the default), this component renders
 * nothing and the dashboard behaves exactly as before. It never shows a
 * number it did not receive.
 */
import { useEffect, useRef, useState } from "react";
import { formatInr } from "@/lib/money";

interface PortfolioMsg {
  type: "portfolio";
  marketValue: string;
  unrealizedPnl: string;
  valued: number;
  total: number;
  at: string;          // ISO time of the quote that caused this update
  dataStatus: string;  // DELAYED | DEMO ... as labelled by the feed
}

export function LiveTotals({ initial }: { initial: { marketValue: string | null; unrealizedPnl: string | null } }) {
  const [msg, setMsg] = useState<PortfolioMsg | null>(null);
  const [state, setState] = useState<"off" | "connecting" | "live" | "lost">("off");
  const closed = useRef(false);

  useEffect(() => {
    closed.current = false;
    let ws: WebSocket | null = null;
    let retry = 1000;
    let failures = 0;
    let opened = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function connect() {
      if (closed.current) return;
      let token: { url: string; token: string } | null = null;
      try {
        const r = await fetch("/api/live-token");
        if (r.status === 204) { setState("off"); return; } // feed not configured
        if (!r.ok) throw new Error("no token");
        token = (await r.json()).data;
      } catch {
        setState("off");
        return;
      }
      setState("connecting");
      ws = new WebSocket(`${token!.url}/live?token=${encodeURIComponent(token!.token)}`);
      ws.onopen = () => { retry = 1000; failures = 0; opened = true; setState("live"); };
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if (m.type === "portfolio") setMsg(m);
        } catch { /* ignore */ }
      };
      ws.onclose = () => {
        if (closed.current) return;
        // Never connected (feed configured but not running): try a few
        // times, then hide the strip instead of logging errors forever.
        if (!opened) failures++;
        if (failures >= 3) { setState("off"); return; }
        setState("lost");
        timer = setTimeout(connect, retry);
        retry = Math.min(retry * 2, 30_000);
      };
      ws.onerror = () => ws?.close();
    }
    connect();
    return () => { closed.current = true; if (timer) clearTimeout(timer); ws?.close(); };
  }, []);

  if (state === "off") return null;
  const mv = msg?.marketValue ?? initial.marketValue;
  const pnl = msg?.unrealizedPnl ?? initial.unrealizedPnl;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-card border border-line bg-white px-4 py-2 text-sm" role="status">
      <span className="inline-flex items-center gap-2">
        <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${state === "live" ? "bg-gain" : "bg-amber-500"}`} />
        {state === "live" ? "Live feed connected" : state === "connecting" ? "Connecting to live feed…" : "Live feed lost, reconnecting…"}
      </span>
      {msg && (
        <>
          <span>Current value <strong className="num">{mv ? formatInr(mv) : "—"}</strong></span>
          <span>Unrealized <strong className={`num ${pnl && pnl.startsWith("-") ? "loss" : "gain"}`}>{pnl ? formatInr(pnl, { signed: true }) : "—"}</strong></span>
          <span className="text-xs text-ink-muted">{msg.valued}/{msg.total} holdings · {msg.dataStatus.toLowerCase()} quotes · updated {new Date(msg.at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST</span>
        </>
      )}
    </div>
  );
}
