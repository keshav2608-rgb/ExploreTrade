import { handle, ok, parseWith, requireUserId, toJson } from "@/lib/api";
import { historyRangeSchema } from "@/lib/validation";
import { getInstrumentHistory } from "@/lib/services/instruments";

export const GET = handle(async (req, { params }) => {
  await requireUserId();
  const { id } = await params;
  const range = parseWith(historyRangeSchema, new URL(req.url).searchParams.get("range") ?? undefined);
  return ok(toJson(await getInstrumentHistory(id, range)));
});
