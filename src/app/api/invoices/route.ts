import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { listInvoices } from "@/lib/core/invoices/invoice.service";

export async function GET(): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const invoices = await listInvoices(authContext.organization.id);
    return ok({ invoices, count: invoices.length });
  } catch (error: unknown) {
    return authFail(error);
  }
}
