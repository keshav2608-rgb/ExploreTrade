/**
 * Transactions service: the only place that writes Transaction rows.
 *
 * Every function takes the authenticated `userId` first and scopes every
 * query by it (NFR-05). A sell is validated by replaying the instrument's
 * full history *with the proposed change applied* (SRS §7.2), inside a
 * database transaction so a concurrent edit cannot slip a negative holding
 * through (NFR-13).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { HttpError } from "../errors";
import { replayPosition, SellExceedsHoldingError, type TxInput } from "../portfolio";
import type { TransactionInput } from "../validation";

const include = { instrument: { select: { id: true, symbol: true, companyName: true, exchange: true } } } as const;
export type TransactionRow = Prisma.TransactionGetPayload<{ include: typeof include }>;

function toTxInput(t: { id: string; instrumentId: string; type: string; tradeDate: Date; quantity: Prisma.Decimal; pricePerShare: Prisma.Decimal; charges: Prisma.Decimal; createdAt: Date }): TxInput {
  return { id: t.id, instrumentId: t.instrumentId, type: t.type as "BUY" | "SELL", tradeDate: t.tradeDate, quantity: t.quantity.toString(), pricePerShare: t.pricePerShare.toString(), charges: t.charges.toString(), createdAt: t.createdAt };
}

/**
 * Throw a 400 if, after applying `proposed` (and excluding `excludeId`,
 * the row being edited), any sell of this instrument would exceed the
 * holding on its date.
 */
async function assertNoNegativeHolding(tx: Prisma.TransactionClient, userId: string, instrumentId: string, proposed: TxInput | null, excludeId?: string) {
  const rows = await tx.transaction.findMany({ where: { userId, instrumentId, ...(excludeId ? { id: { not: excludeId } } : {}) } });
  const all = rows.map(toTxInput);
  if (proposed) all.push(proposed);
  try {
    replayPosition(all);
  } catch (e) {
    if (e instanceof SellExceedsHoldingError) {
      throw new HttpError(400, "NEGATIVE_HOLDING", e.message, { quantity: `Only ${e.available.toString()} shares are held on that date.` });
    }
    throw e;
  }
}

export async function listTransactions(userId: string, page = 1, pageSize = 25) {
  const [rows, total] = await prisma.$transaction([
    prisma.transaction.findMany({ where: { userId }, include, orderBy: [{ tradeDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.transaction.count({ where: { userId } }),
  ]);
  return { rows, total, page, pageSize };
}

export async function getTransaction(userId: string, id: string): Promise<TransactionRow> {
  const row = await prisma.transaction.findFirst({ where: { id, userId }, include });
  if (!row) throw new HttpError(404, "NOT_FOUND", "Transaction not found.");
  return row;
}

export async function createTransaction(userId: string, input: TransactionInput): Promise<TransactionRow> {
  const instrument = await prisma.instrument.findFirst({ where: { id: input.instrumentId, isActive: true } });
  if (!instrument) throw new HttpError(400, "VALIDATION", "Choose a supported stock.", { instrumentId: "Unknown or unsupported stock" });
  return prisma.$transaction(async (tx) => {
    const proposed: TxInput = { id: "proposed", instrumentId: input.instrumentId, type: input.type, tradeDate: new Date(input.tradeDate + "T00:00:00Z"), quantity: input.quantity, pricePerShare: input.pricePerShare, charges: input.charges, createdAt: new Date() };
    await assertNoNegativeHolding(tx, userId, input.instrumentId, proposed);
    return tx.transaction.create({
      data: { userId, instrumentId: input.instrumentId, type: input.type, tradeDate: proposed.tradeDate, quantity: input.quantity, pricePerShare: input.pricePerShare, charges: input.charges ?? "0", notes: input.notes ?? null },
      include,
    });
  });
}

export async function updateTransaction(userId: string, id: string, input: TransactionInput): Promise<TransactionRow> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({ where: { id, userId } });
    if (!existing) throw new HttpError(404, "NOT_FOUND", "Transaction not found.");
    const instrument = await tx.instrument.findFirst({ where: { id: input.instrumentId, isActive: true } });
    if (!instrument) throw new HttpError(400, "VALIDATION", "Choose a supported stock.", { instrumentId: "Unknown or unsupported stock" });
    const proposed: TxInput = { id, instrumentId: input.instrumentId, type: input.type, tradeDate: new Date(input.tradeDate + "T00:00:00Z"), quantity: input.quantity, pricePerShare: input.pricePerShare, charges: input.charges, createdAt: existing.createdAt };
    // If the instrument changed, the old instrument's history must also
    // remain valid without this row.
    if (existing.instrumentId !== input.instrumentId) await assertNoNegativeHolding(tx, userId, existing.instrumentId, null, id);
    await assertNoNegativeHolding(tx, userId, input.instrumentId, proposed, id);
    return tx.transaction.update({
      where: { id },
      data: { instrumentId: input.instrumentId, type: input.type, tradeDate: proposed.tradeDate, quantity: input.quantity, pricePerShare: input.pricePerShare, charges: input.charges ?? "0", notes: input.notes ?? null },
      include,
    });
  });
}

export async function deleteTransaction(userId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({ where: { id, userId } });
    if (!existing) throw new HttpError(404, "NOT_FOUND", "Transaction not found.");
    // Deleting a buy can make a later sell invalid; refuse rather than
    // leave a negative holding (FR-TXN-08 + FR-TXN-06).
    await assertNoNegativeHolding(tx, userId, existing.instrumentId, null, id);
    await tx.transaction.delete({ where: { id } });
  });
}

/** CSV export of the user's full history (FR-TXN-12). */
export async function transactionsCsv(userId: string): Promise<string> {
  const rows = await prisma.transaction.findMany({ where: { userId }, include, orderBy: [{ tradeDate: "asc" }, { createdAt: "asc" }] });
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = ["trade_date,symbol,exchange,company,type,quantity,price_per_share,charges,notes"];
  for (const r of rows) {
    lines.push([r.tradeDate.toISOString().slice(0, 10), r.instrument.symbol, r.instrument.exchange, esc(r.instrument.companyName), r.type, r.quantity.toString(), r.pricePerShare.toString(), r.charges.toString(), esc(r.notes ?? "")].join(","));
  }
  return lines.join("\n") + "\n";
}
