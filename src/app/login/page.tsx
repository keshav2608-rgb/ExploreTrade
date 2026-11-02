import Link from "next/link";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; registered?: string }> }) {
  const { next, registered } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 text-sm text-ink-muted no-underline">← PortfolioPulse</Link>
      <div className="card card-pad">
        <h1>Log in</h1>
        {registered && <p className="mt-2 text-sm text-gain">Account created. Log in to continue.</p>}
        <LoginForm next={next ?? "/dashboard"} />
        <p className="mt-6 text-sm text-ink-muted">
          New here? <Link href="/register">Create an account</Link>
        </p>
      </div>
    </main>
  );
}
