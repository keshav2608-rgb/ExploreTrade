"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "./client";
import { Field, FormError, SelectField } from "./FormField";
import { StockSearch, type InstrumentOption } from "./StockSearch";
import { formatInr } from "@/lib/money";

export interface TransactionFormValues {
  id?: string;
  instrument: InstrumentOption | null;
  type: "BUY" | "SELL";
  tradeDate: string;
  quantity: string;
  pricePerShare: string;
  charges: string;
  notes: string;
}

/** Add / edit transaction form (SRS §5.2, §5.3) with a live total preview. */
export function TransactionForm({ initial, mode }: { initial: TransactionFormValues; mode: "create" | "edit" }) {
  const router = useRouter();
  const [v, setV] = useState<TransactionFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const preview = useMemo(() => {
    const q = Number(v.quantity), p = Number(v.pricePerShare), c = Number(v.charges || 0);
    if (!(q > 0 && p > 0) || !(c >= 0)) return null;
    const gross = q * p;
    return { gross, net: v.type === "BUY" ? gross + c : gross - c };
  }, [v.quantity, v.pricePerShare, v.charges, v.type]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFields({});
    if (!v.instrument) {
      setFields({ instrumentId: "Choose a stock from the list" });
      return;
    }
    setBusy(true);
    const payload = { instrumentId: v.instrument.id, type: v.type, tradeDate: v.tradeDate, quantity: v.quantity, pricePerShare: v.pricePerShare, charges: v.charges || "0", notes: v.notes || null };
    try {
      if (mode === "create") await api("/api/transactions", { method: "POST", body: JSON.stringify(payload) });
      else await api(`/api/transactions/${v.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      router.push("/portfolio");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        setFields(err.fields);
      } else setError("Could not save. Please try again.");
      setBusy(false);
    }
  }

  const set = (k: keyof TransactionFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={error} />
      <StockSearch value={v.instrument} onChange={(i) => setV({ ...v, instrument: i })} error={fields.instrumentId} autoFocus={mode === "create" && !v.instrument} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Type" name="type" value={v.type} onChange={set("type")} error={fields.type}>
          <option value="BUY">Buy</option>
          <option value="SELL">Sell</option>
        </SelectField>
        <Field label="Trade date" name="tradeDate" type="date" value={v.tradeDate} onChange={set("tradeDate")} max={new Date().toISOString().slice(0, 10)} required error={fields.tradeDate} />
        <Field label="Quantity (shares)" name="quantity" type="number" inputMode="decimal" min="0" step="any" value={v.quantity} onChange={set("quantity")} required error={fields.quantity} />
        <Field label="Price per share (₹)" name="pricePerShare" type="number" inputMode="decimal" min="0" step="any" value={v.pricePerShare} onChange={set("pricePerShare")} required error={fields.pricePerShare} />
        <Field label="Brokerage and charges (₹, optional)" name="charges" type="number" inputMode="decimal" min="0" step="any" value={v.charges} onChange={set("charges")} error={fields.charges} hint="Added to cost on a buy, deducted from proceeds on a sell." />
        <Field label="Notes (optional)" name="notes" value={v.notes} onChange={set("notes")} maxLength={500} error={fields.notes} />
      </div>
      <div className="rounded-lg bg-canvas px-4 py-3 text-sm" aria-live="polite">
        {preview ? (
          <>
            <div className="flex justify-between"><span className="text-ink-muted">Gross value</span><span className="num">{formatInr(preview.gross)}</span></div>
            <div className="flex justify-between font-medium"><span>{v.type === "BUY" ? "Total cash out" : "Net cash in"}</span><span className="num">{formatInr(preview.net)}</span></div>
          </>
        ) : (
          <span className="text-ink-muted">Enter a quantity and price above zero to preview the total.</span>
        )}
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : mode === "create" ? "Save transaction" : "Save changes"}</button>
        <button type="button" className="btn-secondary" onClick={() => router.back()}>Cancel</button>
      </div>
    </form>
  );
}
