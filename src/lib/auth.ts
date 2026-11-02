/**
 * Authentication with Auth.js (next-auth v5): email + password stored as a
 * bcrypt hash, JWT sessions in an HTTP-only cookie.
 *
 * Why credentials rather than a hosted provider: the project must run on a
 * laptop with no external accounts. The password handling is the standard
 * one (bcrypt, cost 12, never logged, never returned). Swapping to Supabase
 * Auth or an OAuth provider later means adding a provider here and keeping
 * `session.user.id` as the ownership key everywhere else.
 */
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import { loginSchema } from "./validation";
import { verifyPassword } from "./password";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
        if (!user) return null;
        const okPw = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!okPw) return null;
        return { id: user.id, email: user.email, name: user.displayName };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

export { hashPassword } from "./password";
