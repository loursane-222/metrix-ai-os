import { requestAuthOtp } from "@/lib/application/auth/auth.service";
import { AuthError } from "@/lib/auth/shared/auth.errors";
import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
  optionalBoolean,
  readJsonObject,
  requiredString,
} from "@/lib/api/validation";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonObject(request);
    const result = await requestAuthOtp({
      phone: requiredString(body, "email"),
      rememberMe: optionalBoolean(body, "rememberMe"),
    });

    return ok(result);
  } catch (error: unknown) {
    if (error instanceof ApiValidationError || error instanceof AuthError) {
      return fail(error.message, error instanceof AuthError ? error.status : 400);
    }

    return fail("Unexpected error.");
  }
}
