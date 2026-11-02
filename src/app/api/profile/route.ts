import { forgetUser, handle, ok, parseBody, requireUserId, toJson } from "@/lib/api";
import { signOut } from "@/lib/auth";
import { profileSchema } from "@/lib/validation";
import { deleteAccount, getProfile, updateProfile } from "@/lib/services/users";

export const GET = handle(async () => ok(toJson(await getProfile(await requireUserId()))));

export const PATCH = handle(async (req) => {
  const userId = await requireUserId();
  const input = await parseBody(req, profileSchema);
  return ok(await updateProfile(userId, input));
});

export const DELETE = handle(async () => {
  const userId = await requireUserId();
  await deleteAccount(userId);
  forgetUser(userId);
  // Clear the session cookie so the now-orphaned JWT cannot be reused.
  await signOut({ redirect: false });
  return ok({ deleted: true });
});
