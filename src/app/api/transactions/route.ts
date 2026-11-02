import { handle, ok, parseBody, parseWith, requireUserId, toJson } from "@/lib/api";
import { paginationSchema, transactionSchema } from "@/lib/validation";
import { createTransaction, listTransactions } from "@/lib/services/transactions";

export const GET = handle(async (req) => {
  const userId = await requireUserId();
  const { page, pageSize } = parseWith(paginationSchema, Object.fromEntries(new URL(req.url).searchParams));
  return ok(toJson(await listTransactions(userId, page, pageSize)));
});

export const POST = handle(async (req) => {
  const userId = await requireUserId();
  const input = await parseBody(req, transactionSchema);
  return ok(toJson(await createTransaction(userId, input)), { status: 201 });
});
