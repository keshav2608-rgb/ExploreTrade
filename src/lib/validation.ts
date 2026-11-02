/**
 * Request validation schemas (zod). Used by every API route and server
 * action so the server, not the browser, is the authority (NFR-06).
 */
import { z } from "zod";

/** A positive decimal with at most `dp` decimal places, received as string or number. */
const decimalString = (dp: number, label: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => /^\d+(\.\d+)?$/.test(v), `${label} must be a number`)
    .refine((v) => (v.split(".")[1]?.length ?? 0) <= dp, `${label} can have at most ${dp} decimal places`);

const positiveDecimal = (dp: number, label: string) =>
  decimalString(dp, label).refine((v) => Number(v) > 0, `${label} must be greater than zero`);

const nonNegativeDecimal = (dp: number, label: string) =>
  decimalString(dp, label).refine((v) => Number(v) >= 0, `${label} cannot be negative`);

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  displayName: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
});

export const transactionSchema = z.object({
  instrumentId: z.string().min(1, "Choose a stock"),
  type: z.enum(["BUY", "SELL"]),
  tradeDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker (YYYY-MM-DD)")
    .refine((d) => new Date(d + "T00:00:00Z").getTime() <= Date.now() + 86_400_000, "Trade date cannot be in the future"),
  quantity: positiveDecimal(4, "Quantity"),
  pricePerShare: positiveDecimal(4, "Price per share"),
  charges: nonNegativeDecimal(2, "Charges").optional().default("0"),
  notes: z.string().trim().max(500).optional().nullable(),
});
export type TransactionInput = z.infer<typeof transactionSchema>;

export const watchlistAddSchema = z.object({ instrumentId: z.string().min(1) });

export const alertCreateSchema = z.object({
  instrumentId: z.string().min(1, "Choose a stock"),
  condition: z.enum(["ABOVE", "BELOW"]),
  thresholdPrice: positiveDecimal(2, "Threshold price"),
});
export const alertUpdateSchema = z
  .object({
    condition: z.enum(["ABOVE", "BELOW"]).optional(),
    thresholdPrice: positiveDecimal(2, "Threshold price").optional(),
    isEnabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const notificationUpdateSchema = z.object({ isRead: z.boolean() });

export const historyRangeSchema = z.enum(["1M", "3M", "6M", "1Y"]).default("3M");

export const searchSchema = z.object({ q: z.string().trim().max(60).default("") });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
