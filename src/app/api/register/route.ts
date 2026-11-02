import { handle, ok, parseBody } from "@/lib/api";
import { registerSchema } from "@/lib/validation";
import { registerUser } from "@/lib/services/users";

// Public: creates an account. The client then signs in through Auth.js.
export const POST = handle(async (req) => {
  const input = await parseBody(req, registerSchema);
  const user = await registerUser(input);
  return ok(user, { status: 201 });
});
