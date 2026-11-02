"use client";

import { useState } from "react";
import { AlertForm } from "./AlertForm";

/** Inline "Edit" that expands into the alert form. */
export function AlertEditor({ alert }: { alert: { id: string; condition: "ABOVE" | "BELOW"; thresholdPrice: string } }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>Edit</button>;
  return (
    <div className="w-full rounded-lg border border-line bg-canvas p-3">
      <AlertForm alert={alert} onDone={() => setOpen(false)} />
    </div>
  );
}
