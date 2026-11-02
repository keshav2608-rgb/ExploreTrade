"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "./client";
import { Field, FormError, SelectField } from "./FormField";
import { StockSearch, type InstrumentOption } from "./StockSearch";

/** Create or edit a price alert (SRS §5.5). */
export function AlertForm({ instrument, alert, onDone }: { instrument?: InstrumentOption | null; alert?: { id: string; condition: "ABOVE" | "BELOW"; thresholdPrice: string }; onDone?: () => void }) {
  const router = useRouter();
  const [inst, setInst] = useState<InstrumentOption | null>(instrument ?? null);
  const [condition, setCondition] = useState<"ABOVE" | "BELOW">(alert?.condition ?? "ABOVE");
  const [threshold, setThreshold] = useState(alert?.thresholdPrice ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFields({});
    if (!alert && !inst) return setFields({ instrumentId: "Choose a stock" });
    setBusy(true);
    try {
      if (alert) await api(`/api/alerts/${alert.id}`, { method: "PATCH", body: JSON.stringify({ condition, thresholdPrice: threshold }) });
      else await api("/api/alerts", { method: "POST", body: JSON.stringify({ instrumentId: inst!.id, condition, thresholdPrice: threshold }) });
      onDone ? onDone() : router.push("/alerts");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) { setError(err.message); setFields(err.fields); } else setError("Could not save the alert.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={error} />
      {!alert && !instrument && <StockSearch value={inst} onChange={setInst} error={fields.instrumentId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Notify me when the price goes" name="condition" value={condition} onChange={(e) => setCondition(e.target.value as "ABOVE" | "BELOW")}>
          <option value="ABOVE">above</option>
          <option value="BELOW">below</option>
        </SelectField>
        <Field label="Threshold price (₹)" name="thresholdPrice" type="number" inputMode="decimal" min="0" step="0.01" value={threshold} onChange={(e) => setThreshold(e.target.value)} required error={fields.thresholdPrice} />
      </div>
      <p className="text-xs text-ink-muted">Alerts are checked on a schedule against the latest available quote, so delivery depends on quote availability and the polling interval, not on the exact moment the price crosses.</p>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : alert ? "Save changes" : "Create alert"}</button>
        {onDone && <button type="button" className="btn-secondary" onClick={onDone}>Cancel</button>}
      </div>
    </form>
  );
}
