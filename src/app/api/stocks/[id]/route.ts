import { handle, ok, requireUserId, toJson } from "@/lib/api";
import { getInstrumentDetail } from "@/lib/services/instruments";
import { isWatched } from "@/lib/services/watchlist";

export const GET = handle(async (_req, { params }) => {
  const userId = await requireUserId();
  const { id } = await params;
  const detail = await getInstrumentDetail(id);
  const watchlistItemId = await isWatched(userId, id);
  return ok(toJson({ ...detail, watchlistItemId }));
});
