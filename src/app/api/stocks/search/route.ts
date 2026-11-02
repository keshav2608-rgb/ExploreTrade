import { handle, ok, parseWith, requireUserId } from "@/lib/api";
import { searchSchema } from "@/lib/validation";
import { searchInstruments } from "@/lib/services/instruments";

export const GET = handle(async (req) => {
  await requireUserId();
  const { q } = parseWith(searchSchema, Object.fromEntries(new URL(req.url).searchParams));
  return ok(await searchInstruments(q));
});
