import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { countInvoices, listInvoices } from "@/lib/core/invoices/invoice.service";

function serializeInvoice(invoice: Awaited<ReturnType<typeof listInvoices>>[number]) {
  const payments = invoice.payments ?? [];
  return {
    ...invoice,
    paymentCount: payments.length,
    paymentReferences: payments.map((payment) => `${payment.title} (${String(payment.amount)} ${invoice.currency})`).join(", ") || null,
  };
}

export async function GET(): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const [invoices, totalCount] = await Promise.all([
      listInvoices(authContext.organization.id),
      countInvoices(authContext.organization.id),
    ]);
    return ok({ invoices: invoices.map(serializeInvoice), count: totalCount });
  } catch (error: unknown) {
    return authFail(error);
  }
}
