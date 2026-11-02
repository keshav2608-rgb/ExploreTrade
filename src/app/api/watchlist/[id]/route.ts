import { handle, ok, requireUserId } from "@/lib/api";
import { removeFromWatchlist } from "@/lib/services/watchlist";

export const DELETE = handle(async (_req, { params }) => {
  const userId = await requireUserId();
  const { id } = await params;
  await removeFromWatchlist(userId, id);
  return ok({ deleted: id });
});
