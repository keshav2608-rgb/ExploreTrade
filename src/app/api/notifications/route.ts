import { handle, ok, parseWith, requireUserId, toJson } from "@/lib/api";
import { paginationSchema } from "@/lib/validation";
import { listNotifications } from "@/lib/services/alerts";

export const GET = handle(async (req) => {
  const userId = await requireUserId();
  const { page, pageSize } = parseWith(paginationSchema, Object.fromEntries(new URL(req.url).searchParams));
  return ok(toJson(await listNotifications(userId, page, pageSize)));
});
