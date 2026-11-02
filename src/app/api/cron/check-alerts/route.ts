import { fail, handle, ok } from "@/lib/api";
import { runAlertCheck } from "@/lib/services/alerts";

/**
 * Scheduled entry point (FR-ALT-04). Called by scripts/alert-worker.ts or a
 * platform cron with `Authorization: Bearer $CRON_SECRET`. Refreshes quotes
 * for alerted instruments, evaluates alerts, and records daily valuations.
 *
 * Body (optional, for demos and tests): { "testQuotes": { "<instrumentId>": "123.45" } }
 * A test quote is applied to the evaluation only; it is never stored as a
 * real quote.
 */
export const POST = handle(async (req) => {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) return fail(401, "UNAUTHENTICATED", "Missing or wrong CRON_SECRET.");
  let override: Map<string, string> | undefined;
  try {
    const body = await req.json();
    if (body && typeof body.testQuotes === "object" && body.testQuotes) {
      override = new Map(
        Object.entries(body.testQuotes as Record<string, string>)
          .filter(([, v]) => /^\d+(\.\d+)?$/.test(String(v)))
          .map(([k, v]) => [k, String(v)]),
      );
    }
  } catch {
    /* no body */
  }
  const result = await runAlertCheck({ quoteOverride: override, recordValuations: true });
  return ok({ ...result, testQuotesApplied: override?.size ?? 0 });
});
