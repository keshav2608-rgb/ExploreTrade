import { handle, ok, parseBody, requireUserId } from "@/lib/api";
import { notificationUpdateSchema } from "@/lib/validation";
import { markNotification } from "@/lib/services/alerts";

export const PATCH = handle(async (req, { params }) => {
  const userId = await requireUserId();
  const { id } = await params;
  const { isRead } = await parseBody(req, notificationUpdateSchema);
  await markNotification(userId, id, isRead);
  return ok({ id, isRead });
});
