/**
 * Test bootstrap: point Prisma at a throw-away SQLite file, apply the
 * migrations, and force the demo provider so no test touches the network.
 */
import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const dbFile = path.resolve(__dirname, "../prisma/test.db");
process.env.DATABASE_URL = `file:${dbFile}`;
process.env.MARKET_DATA_PROVIDER = "demo";
process.env.AUTH_SECRET = "test-secret";
process.env.CRON_SECRET = "test-cron";
process.env.QUOTE_FRESHNESS_MINUTES = "20";

for (const f of [dbFile, dbFile + "-journal"]) if (existsSync(f)) unlinkSync(f);
execSync("npx prisma migrate deploy", { stdio: "ignore", env: { ...process.env } });
