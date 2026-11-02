import { handle, ok, requireUserId, toJson } from "@/lib/api";
import { getMarketOverview } from "@/lib/services/instruments";

export const GET = handle(async () => {
  await requireUserId();
  return ok(toJson(await getMarketOverview()));
});
