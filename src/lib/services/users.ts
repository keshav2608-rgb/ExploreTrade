/** Account service: registration, profile, deletion (SRS §6.1). */
import { prisma } from "../prisma";
import { HttpError } from "../errors";
import { hashPassword } from "../password";

export async function registerUser(input: { email: string; displayName: string; password: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new HttpError(409, "EMAIL_TAKEN", "An account with this email already exists. Try logging in.", { email: "Already registered" });
  const user = await prisma.user.create({ data: { email: input.email, displayName: input.displayName, passwordHash: await hashPassword(input.password) }, select: { id: true, email: true, displayName: true, createdAt: true } });
  return user;
}

export async function getProfile(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, displayName: true, createdAt: true, _count: { select: { transactions: true, watchlist: true, alerts: true } } } });
  if (!u) throw new HttpError(404, "NOT_FOUND", "Account not found.");
  return u;
}

export async function updateProfile(userId: string, input: { displayName: string }) {
  return prisma.user.update({ where: { id: userId }, data: { displayName: input.displayName }, select: { id: true, email: true, displayName: true } });
}

/** Deletes the account and, via cascades, every private record (FR-AUTH-06). */
export async function deleteAccount(userId: string): Promise<void> {
  await prisma.user.delete({ where: { id: userId } });
}
