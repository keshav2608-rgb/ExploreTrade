import { handle, ok, requireUserId, toJson } from "@/lib/api";
import { getPortfolio } from "@/lib/services/portfolio";

export const GET = handle(async () => {
  const userId = await requireUserId();
  return ok(toJson(await getPortfolio(userId)));
});
