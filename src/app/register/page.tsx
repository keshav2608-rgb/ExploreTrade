import Link from "next/link";
import { RegisterForm } from "./RegisterForm";

export const metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 text-sm text-ink-muted no-underline">← PortfolioPulse</Link>
      <div className="card card-pad">
        <h1>Create your account</h1>
        <p className="mt-1 text-sm text-ink-muted">Only an email, a name and a password are stored. <Link href="/privacy">Privacy notice</Link></p>
        <RegisterForm />
        <p className="mt-6 text-sm text-ink-muted">
          Already registered? <Link href="/login">Log in</Link>
        </p>
      </div>
    </main>
  );
}
