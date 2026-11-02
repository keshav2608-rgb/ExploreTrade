import Link from "next/link";

export const metadata = { title: "Privacy notice" };

/** Plain-language privacy notice (SRS §14). */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-10 text-sm">
      <h1>Privacy notice</h1>
      <p>PortfolioPulse stores the minimum needed to run the service:</p>
      <ul className="list-disc space-y-2 pl-5">
        <li><strong>Account:</strong> your email, a display name and a bcrypt hash of your password. The password itself is never stored or logged.</li>
        <li><strong>Portfolio data you enter:</strong> transactions, watchlist entries, price alerts and the notifications they produce. Only you can read them; every request is checked against your logged-in session on the server.</li>
        <li><strong>Market quotes:</strong> prices retrieved from the configured provider are cached with their timestamp and source. They are not personal data.</li>
      </ul>
      <p>No analytics or advertising trackers are used. Session cookies are HTTP-only. You can delete your account from the profile page; this removes all of the records above.</p>
      <p>Displayed values are informational estimates based on your entries and the latest available market data, not investment advice.</p>
      <p><Link href="/">Back to home</Link></p>
    </main>
  );
}
