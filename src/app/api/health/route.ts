// Liveness check used by scripts and the README verification.
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";

export async function GET() {
  try {
    const instruments = await prisma.instrument.count();
    return ok({ status: "ok", instruments, provider: process.env.MARKET_DATA_PROVIDER ?? "demo", time: new Date().toISOString() });
  } catch (e) {
    return fail(503, "DB_UNAVAILABLE", `Database not reachable: ${e instanceof Error ? e.message : String(e)}`);
  }
}
