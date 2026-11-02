"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { api, ApiClientError } from "@/components/client";
import { Field, FormError } from "@/components/FormField";

export function RegisterForm() {
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFields({});
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const payload = { email: String(fd.get("email")), displayName: String(fd.get("displayName")), password: String(fd.get("password")) };
    try {
      await api("/api/register", { method: "POST", body: JSON.stringify(payload) });
      const res = await signIn("credentials", { email: payload.email, password: payload.password, redirect: false });
      window.location.href = res?.error ? "/login?registered=1" : "/dashboard";
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        setFields(err.fields);
      } else setError("Could not create the account. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
      <FormError message={error} />
      <Field label="Display name" name="displayName" autoComplete="name" required error={fields.displayName} />
      <Field label="Email" name="email" type="email" autoComplete="email" required error={fields.email} />
      <Field label="Password" name="password" type="password" autoComplete="new-password" required minLength={8} hint="At least 8 characters." error={fields.password} />
      <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
    </form>
  );
}
