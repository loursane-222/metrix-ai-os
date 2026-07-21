import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { bootstrapFirstExperience } from "@/lib/first-experience/first-experience.service";

export async function POST(): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    return ok(await bootstrapFirstExperience(auth));
  } catch (error: unknown) {
    return authFail(error);
  }
}
