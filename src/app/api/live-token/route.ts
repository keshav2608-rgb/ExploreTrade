import { createHmac } from "node:crypto";
import { handle, ok, requireUserId } from "@/lib/api";

/**
 * Short-lived token for the optional PulseFeed WebSocket (see
 * services/pulsefeed). Returns 204 when PULSEFEED_WS_URL is not configured,
 * which tells the dashboard to stay in polling mode.
 *
 * Token = `<userId>.<expiresUnix>.<hmac-sha256(secret, userId.expires)>`.
 * PulseFeed shares CRON_SECRET and verifies it, so the feed never trusts a
 * user id it did not sign itself.
 */
export const GET = handle(async () => {
  const userId = await requireUserId();
  const url = process.env.PULSEFEED_WS_URL;
  const secret = process.env.CRON_SECRET;
  if (!url || !secret) return new Response(null, { status: 204 });
  const expires = Math.floor(Date.now() / 1000) + 300;
  const payload = `${userId}.${expires}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return ok({ url, token: `${payload}.${sig}`, expires });
});
