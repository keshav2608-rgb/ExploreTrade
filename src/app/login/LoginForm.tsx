"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Field, FormError } from "@/components/FormField";

export function LoginForm({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = await signIn("credentials", { email: String(fd.get("email")), password: String(fd.get("password")), redirect: false });
    setBusy(false);
    if (res?.error) {
      setError("That email and password combination was not recognised.");
      return;
    }
    // Only allow same-site redirects.
    window.location.href = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
      <FormError message={error} />
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
    </form>
  );
}
