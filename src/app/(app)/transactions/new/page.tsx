import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/ui";
import { TransactionForm } from "@/components/TransactionForm";

export const metadata = { title: "Add transaction" };

/** `?instrument=<id>` pre-selects a stock (from the stock detail page). */
export default async function NewTransactionPage({ searchParams }: { searchParams: Promise<{ instrument?: string; type?: string }> }) {
  const { instrument: instrumentId, type } = await searchParams;
  const instrument = instrumentId ? await prisma.instrument.findFirst({ where: { id: instrumentId, isActive: true }, select: { id: true, symbol: true, companyName: true, exchange: true, sector: true } }) : null;
  return (
    <>
      <PageHeader title="Add transaction" sub="Record a buy or sell you made with your broker. Nothing is traded from here." />
      <Card className="max-w-2xl">
        <TransactionForm mode="create" initial={{ instrument, type: type === "SELL" ? "SELL" : "BUY", tradeDate: new Date().toISOString().slice(0, 10), quantity: "", pricePerShare: "", charges: "", notes: "" }} />
      </Card>
    </>
  );
}
