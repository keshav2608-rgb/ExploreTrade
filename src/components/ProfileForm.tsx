"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "./client";
import { Field, FormError } from "./FormField";

export function ProfileForm({ displayName }: { displayName: string }) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api("/api/profile", { method: "PATCH", body: JSON.stringify({ displayName: name }) });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.fields.displayName ?? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <FormError message={error} />
      <Field label="Display name" name="displayName" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={60} required />
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        {saved && <span className="text-sm text-gain" role="status">Saved</span>}
      </div>
    </form>
  );
}
