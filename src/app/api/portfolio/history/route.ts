import { handle, ok, requireUserId, toJson } from "@/lib/api";
import { getValuationHistory } from "@/lib/services/portfolio";

export const GET = handle(async (req) => {
  const userId = await requireUserId();
  const days = Math.min(365, Math.max(7, Number(new URL(req.url).searchParams.get("days") ?? 90) || 90));
  return ok(toJson(await getValuationHistory(userId, days)));
});
