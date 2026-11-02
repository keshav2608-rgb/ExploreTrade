import { handle, ok, parseBody, requireUserId, toJson } from "@/lib/api";
import { alertUpdateSchema } from "@/lib/validation";
import { deleteAlert, updateAlert } from "@/lib/services/alerts";

export const PATCH = handle(async (req, { params }) => {
  const userId = await requireUserId();
  const { id } = await params;
  const input = await parseBody(req, alertUpdateSchema);
  return ok(toJson(await updateAlert(userId, id, input)));
});

export const DELETE = handle(async (_req, { params }) => {
  const userId = await requireUserId();
  const { id } = await params;
  await deleteAlert(userId, id);
  return ok({ deleted: id });
});
