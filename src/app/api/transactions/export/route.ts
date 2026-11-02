import { handle, requireUserId } from "@/lib/api";
import { transactionsCsv } from "@/lib/services/transactions";

// CSV download of the user's own transactions (FR-TXN-12).
export const GET = handle(async () => {
  const userId = await requireUserId();
  const csv = await transactionsCsv(userId);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="portfoliopulse-transactions.csv"',
    },
  });
});
