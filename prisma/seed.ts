/**
 * Seed the instrument master and, in demo/development, a sample user with
 * a few labelled transactions so the dashboard has something to show.
 *
 *   npm run setup        (runs migrations, then this)
 *   npx tsx prisma/seed.ts
 *
 * Safe to run repeatedly: instruments are upserted, the demo user is only
 * created if absent.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { SEED_INSTRUMENTS } from "../src/lib/instruments";

const prisma = new PrismaClient();

export const DEMO_USER = { email: "demo@portfoliopulse.local", password: "demo12345", displayName: "Demo Investor" };

async function main() {
  for (const i of SEED_INSTRUMENTS) {
    await prisma.instrument.upsert({
      where: { exchange_symbol: { exchange: i.exchange, symbol: i.symbol } },
      create: { symbol: i.symbol, companyName: i.companyName, exchange: i.exchange, sector: i.sector, providerInstrumentId: i.providerInstrumentId, currency: "INR" },
      update: { companyName: i.companyName, sector: i.sector, providerInstrumentId: i.providerInstrumentId },
    });
  }
  // Symbols no longer in the list (e.g. after a demerger) are kept for
  // existing transactions but hidden from search and new entries.
  const keep = SEED_INSTRUMENTS.map((i) => i.symbol);
  const retired = await prisma.instrument.updateMany({ where: { exchange: "NSE", symbol: { notIn: keep }, isActive: true }, data: { isActive: false } });
  console.log(`instruments: ${SEED_INSTRUMENTS.length} upserted, ${retired.count} retired`);

  if (process.env.SEED_DEMO_USER === "false") return;
  const existing = await prisma.user.findUnique({ where: { email: DEMO_USER.email } });
  if (existing) {
    console.log("demo user already exists");
    return;
  }
  const user = await prisma.user.create({
    data: { email: DEMO_USER.email, displayName: DEMO_USER.displayName, passwordHash: await bcrypt.hash(DEMO_USER.password, 12) },
  });
  const sym = async (s: string) => (await prisma.instrument.findUniqueOrThrow({ where: { exchange_symbol: { exchange: "NSE", symbol: s } } })).id;
  const d = (s: string) => new Date(s + "T09:30:00Z");
  await prisma.transaction.createMany({
    data: [
      { userId: user.id, instrumentId: await sym("RELIANCE"), type: "BUY", tradeDate: d("2025-06-02"), quantity: "10", pricePerShare: "1420.50", charges: "20", notes: "Sample data" },
      { userId: user.id, instrumentId: await sym("RELIANCE"), type: "BUY", tradeDate: d("2025-08-14"), quantity: "5", pricePerShare: "1385.00", charges: "10", notes: "Sample data" },
      { userId: user.id, instrumentId: await sym("TCS"), type: "BUY", tradeDate: d("2025-07-10"), quantity: "4", pricePerShare: "3350.00", charges: "15", notes: "Sample data" },
      { userId: user.id, instrumentId: await sym("INFY"), type: "BUY", tradeDate: d("2025-05-21"), quantity: "12", pricePerShare: "1510.00", charges: "18", notes: "Sample data" },
      { userId: user.id, instrumentId: await sym("INFY"), type: "SELL", tradeDate: d("2025-09-03"), quantity: "4", pricePerShare: "1580.00", charges: "12", notes: "Sample data" },
      { userId: user.id, instrumentId: await sym("ITC"), type: "BUY", tradeDate: d("2025-04-15"), quantity: "50", pricePerShare: "415.00", charges: "20", notes: "Sample data" },
    ],
  });
  await prisma.watchlistItem.createMany({
    data: [
      { userId: user.id, instrumentId: await sym("HDFCBANK") },
      { userId: user.id, instrumentId: await sym("TMPV") },
      { userId: user.id, instrumentId: await sym("SBIN") },
    ],
  });
  console.log(`demo user created: ${DEMO_USER.email} / ${DEMO_USER.password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
