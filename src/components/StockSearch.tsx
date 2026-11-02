"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api } from "./client";

export interface InstrumentOption {
  id: string;
  symbol: string;
  companyName: string;
  exchange: string;
  sector: string | null;
}

/**
 * Accessible combobox over /api/stocks/search. Keyboard: arrows move,
 * enter selects, escape closes. Used by the transaction and alert forms
 * and the Explore page.
 */
export function StockSearch({ value, onChange, label = "Stock", error, autoFocus }: { value: InstrumentOption | null; onChange: (v: InstrumentOption | null) => void; label?: string; error?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState(value ? `${value.symbol} · ${value.companyName}` : "");
  const [opts, setOpts] = useState<InstrumentOption[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const id = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value) return; // a selection is shown; do not search it
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        setOpts(await api<InstrumentOption[]>(`/api/stocks/search?q=${encodeURIComponent(q)}`));
      } catch {
        setOpts([]);
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, value]);

  function select(o: InstrumentOption) {
    onChange(o);
    setQ(`${o.symbol} · ${o.companyName}`);
    setOpen(false);
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="label">{label}</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-invalid={!!error}
        autoFocus={autoFocus}
        className="input"
        placeholder="Type a symbol or company, e.g. TCS"
        value={q}
        onChange={(e) => { setQ(e.target.value); onChange(null); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, opts.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === "Enter" && opts[active]) { e.preventDefault(); select(opts[active]); }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {error && <p role="alert" className="mt-1 text-xs text-loss">{error}</p>}
      {open && !value && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-white py-1 shadow-card">
          {loading && opts.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Searching…</li>}
          {!loading && opts.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">No supported stock matches “{q}”.</li>}
          {opts.map((o, i) => (
            <li
              key={o.id}
              role="option"
              aria-selected={i === active}
              className={`cursor-pointer px-3 py-2 text-sm ${i === active ? "bg-brand-50" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); select(o); }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="font-medium">{o.symbol}</span> <span className="text-ink-muted">{o.companyName} · {o.exchange}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
