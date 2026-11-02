"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

/** Labelled input with an inline error (SRS §8.4: every field has a visible label). */
export function Field({ label, name, error, hint, children, ...rest }: { label: string; name: string; error?: string; hint?: ReactNode; children?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children ?? <input id={id} name={name} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} className="input" {...rest} />}
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">{hint}</p>}
      {error && <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-loss">{error}</p>}
    </div>
  );
}

export function SelectField({ label, name, error, children, ...rest }: { label: string; name: string; error?: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <select id={id} name={name} aria-invalid={!!error} className="input" {...rest}>{children}</select>
      {error && <p role="alert" className="mt-1 text-xs text-loss">{error}</p>}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <div role="alert" className="rounded-lg border border-loss/30 bg-loss-soft px-3 py-2 text-sm text-loss">{message}</div>;
}
