/**
 * One PrismaClient for the whole process.
 *
 * Next.js reloads modules in development; without the global cache every
 * reload would open a new connection pool and SQLite would complain about
 * too many open handles.
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
