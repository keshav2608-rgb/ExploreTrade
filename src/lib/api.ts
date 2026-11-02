/**
 * Shared helpers for route handlers: a consistent response envelope,
 * validation errors with field messages, and "must be logged in" checks.
 *
 * Success:  { ok: true,  data: ... }
 * Failure:  { ok: false, error: { code, message, fields? } }
 * Internal errors are logged on the server and returned as a generic
 * message; stack traces never reach the browser (SRS §12.1).
 */
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { auth } from "./auth";
import { HttpError } from "./errors";
import { prisma } from "./prisma";

/** userId -> time until which we trust that the row still exists. */
const userExistsCache = new Map<string, number>();
const USER_CACHE_MS = 30_000;

export type ApiError = { code: string; message: string; fields?: Record<string, string> };

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(status: number, code: string, message: string, fields?: Record<string, string>) {
  return NextResponse.json({ ok: false, error: { code, message, fields } satisfies ApiError }, { status });
}

export { HttpError };

/** Resolve the logged-in user's id or throw 401. Never trusts a user id from the request. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new HttpError(401, "UNAUTHENTICATED", "Please log in to continue.");
  // A JWT outlives the account it was issued for (e.g. after "delete my
  // account"), so confirm the row still exists, with a short cache so the
  // cost is one primary-key lookup per user per 30 s.
  const now = Date.now();
  if ((userExistsCache.get(id) ?? 0) < now) {
    const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      userExistsCache.delete(id);
      throw new HttpError(401, "UNAUTHENTICATED", "This account no longer exists. Please log in again.");
    }
    userExistsCache.set(id, now + USER_CACHE_MS);
  }
  return id;
}

/** Forget a cached existence check (called when an account is deleted). */
export function forgetUser(id: string) {
  userExistsCache.delete(id);
}

/** Parse JSON body against a schema; throws 400 with field messages. */
export async function parseBody<T>(req: Request, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new HttpError(400, "BAD_JSON", "Request body must be valid JSON.");
  }
  return parseWith(schema, json);
}

export function parseWith<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw zodToHttp(r.error);
  return r.data;
}

export function zodToHttp(err: ZodError): HttpError {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!fields[key]) fields[key] = issue.message;
  }
  return new HttpError(400, "VALIDATION", "Please correct the highlighted fields.", fields);
}

/** Wrap a handler so thrown HttpErrors become responses and the rest become 500s. */
export function handle(fn: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.code, e.message, e.fields);
      console.error("[api]", e);
      return fail(500, "INTERNAL", "Something went wrong on our side. Please try again.");
    }
  };
}

/** Serialise Prisma rows: Decimal -> string, BigInt -> string, Date -> ISO. */
export function toJson<T>(value: T): unknown {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => {
      if (typeof v === "bigint") return v.toString();
      if (v && typeof v === "object" && typeof (v as { toFixed?: unknown }).toFixed === "function" && (v as { constructor?: { name?: string } }).constructor?.name === "Decimal") return (v as { toString(): string }).toString();
      return v;
    }),
  );
}
