"use client";

/**
 * Tiny fetch wrapper for the browser side. Reads the API envelope and
 * throws an `ApiClientError` with field messages so forms can show them.
 */
export class ApiClientError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly fields: Record<string, string> = {}) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    credentials: "same-origin",
  });
  let body: { ok?: boolean; data?: T; error?: { code: string; message: string; fields?: Record<string, string> } } = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok || body.ok === false) {
    const e = body.error ?? { code: "HTTP_" + res.status, message: res.status === 401 ? "Your session has expired. Please log in again." : "Request failed." };
    if (res.status === 401 && typeof window !== "undefined") window.location.href = "/login?next=" + encodeURIComponent(window.location.pathname);
    throw new ApiClientError(res.status, e.code, e.message, e.fields ?? {});
  }
  return body.data as T;
}
