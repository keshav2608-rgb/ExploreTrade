import { handle, ok, parseBody, requireUserId, toJson } from "@/lib/api";
import { transactionSchema } from "@/lib/validation";
import { deleteTransaction, getTransaction, updateTransaction } from "@/lib/services/transactions";

export const GET = handle(async (_req, { params }) => {
  const userId = await requireUserId();
  const { id } = await params;
  return ok(toJson(await getTransaction(userId, id)));
});

export const PATCH = handle(async (req, { params }) => {
  const userId = await requireUserId();
  const { id } = await params;
  const input = await parseBody(req, transactionSchema);
  return ok(toJson(await updateTransaction(userId, id, input)));
});

export const DELETE = handle(async (_req, { params }) => {
  const userId = await requireUserId();
  const { id } = await params;
  await deleteTransaction(userId, id);
  return ok({ deleted: id });
});
