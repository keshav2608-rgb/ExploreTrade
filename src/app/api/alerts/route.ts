import { handle, ok, parseBody, requireUserId, toJson } from "@/lib/api";
import { alertCreateSchema } from "@/lib/validation";
import { createAlert, listAlerts } from "@/lib/services/alerts";

export const GET = handle(async () => {
  const userId = await requireUserId();
  return ok(toJson(await listAlerts(userId)));
});

export const POST = handle(async (req) => {
  const userId = await requireUserId();
  const input = await parseBody(req, alertCreateSchema);
  return ok(toJson(await createAlert(userId, input)), { status: 201 });
});
