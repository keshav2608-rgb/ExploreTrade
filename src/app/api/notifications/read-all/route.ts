import { handle, ok, requireUserId } from "@/lib/api";
import { markAllRead } from "@/lib/services/alerts";

export const POST = handle(async () => {
  const userId = await requireUserId();
  await markAllRead(userId);
  return ok({ done: true });
});
