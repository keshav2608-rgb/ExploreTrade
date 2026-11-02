import { auth } from "@/lib/auth";
import { getProfile } from "@/lib/services/users";
import { Card, PageHeader, formatDate } from "@/components/ui";
import { ProfileForm } from "@/components/ProfileForm";
import { DeleteButton } from "@/components/Actions";
import { SignOutButton } from "@/components/SignOutButton";

export const metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();
  const p = await getProfile(session!.user.id);
  return (
    <>
      <PageHeader title="Profile" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Your details">
          <dl className="mb-4 grid grid-cols-[120px_1fr] gap-y-1 text-sm">
            <dt className="text-ink-muted">Email</dt><dd>{p.email}</dd>
            <dt className="text-ink-muted">Member since</dt><dd>{formatDate(p.createdAt)}</dd>
            <dt className="text-ink-muted">Records</dt><dd>{p._count.transactions} transactions · {p._count.watchlist} watched · {p._count.alerts} alerts</dd>
          </dl>
          <ProfileForm displayName={p.displayName} />
        </Card>
        <Card title="Account">
          <p className="text-sm text-ink-muted">Log out of this browser, or delete the account and every record it owns. Deletion cannot be undone.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <SignOutButton className="btn-secondary" />
            <DeleteButton path="/api/profile" confirmText="Delete your account and all of its transactions, watchlist, alerts and notifications? This cannot be undone." label="Delete account" redirectTo="/" />
          </div>
        </Card>
      </div>
    </>
  );
}
