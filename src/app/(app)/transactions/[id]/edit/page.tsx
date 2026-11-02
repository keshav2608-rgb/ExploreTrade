import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/ui";
import { TransactionForm } from "@/components/TransactionForm";
import { DeleteButton } from "@/components/Actions";

export const metadata = { title: "Edit transaction" };

export default async function EditTransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  // Ownership enforced in the query: another user's id simply 404s.
  const tx = await prisma.transaction.findFirst({ where: { id, userId: session!.user.id }, include: { instrument: { select: { id: true, symbol: true, companyName: true, exchange: true, sector: true } } } });
  if (!tx) notFound();
  return (
    <>
      <PageHeader title="Edit transaction" action={<DeleteButton path={`/api/transactions/${tx.id}`} confirmText="Delete this transaction? Holdings and totals will be recalculated." redirectTo="/portfolio" />} />
      <Card className="max-w-2xl">
        <TransactionForm mode="edit" initial={{ id: tx.id, instrument: tx.instrument, type: tx.type as "BUY" | "SELL", tradeDate: tx.tradeDate.toISOString().slice(0, 10), quantity: tx.quantity.toString(), pricePerShare: tx.pricePerShare.toString(), charges: tx.charges.isZero() ? "" : tx.charges.toString(), notes: tx.notes ?? "" }} />
      </Card>
    </>
  );
}
