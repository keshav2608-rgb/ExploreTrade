import { handle, ok, parseBody, requireUserId, toJson } from "@/lib/api";
import { watchlistAddSchema } from "@/lib/validation";
import { addToWatchlist, listWatchlist } from "@/lib/services/watchlist";

export const GET = handle(async () => {
  const userId = await requireUserId();
  return ok(toJson(await listWatchlist(userId)));
});

export const POST = handle(async (req) => {
  const userId = await requireUserId();
  const { instrumentId } = await parseBody(req, watchlistAddSchema);
  return ok(toJson(await addToWatchlist(userId, instrumentId)), { status: 201 });
});
