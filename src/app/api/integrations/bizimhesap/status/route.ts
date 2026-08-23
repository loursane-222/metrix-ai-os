import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { getBizimHesapStatus } from "@/lib/integrations/bizimhesap/bizimhesap.service";

export async function GET(): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    return ok(await getBizimHesapStatus(auth.organization.id));
  } catch (error) {
    return authFail(error);
  }
}
