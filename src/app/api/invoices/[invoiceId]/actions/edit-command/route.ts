import { fail, ok } from "@/lib/api/response";
import { readJsonObject, requiredString } from "@/lib/api/validation";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { findInvoiceById } from "@/lib/core/invoices/invoice.service";
import { generateInvoiceEditCommandText } from "@/lib/invoices/invoice-edit-command-ai-adapter";
import { resolveInvoiceEditCommand } from "@/lib/invoices/invoice-edit-command-resolver";

export const maxDuration = 60;
export async function POST(request: Request, context: { params: Promise<{ invoiceId: string }> }): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies(); const { invoiceId } = await context.params;
    const body = await readJsonObject(request); const utterance = requiredString(body, "utterance"); const activeTab = requiredString(body, "activeTab");
    const invoice = await findInvoiceById(invoiceId, auth.organization.id); if (!invoice) return fail("Invoice not found.", 404);
    const outcome = await resolveInvoiceEditCommand({ utterance, activeTab, generateText: generateInvoiceEditCommandText, context: { invoiceNumber: invoice.invoiceNumber, status: invoice.status } });
    return ok({ outcome });
  } catch (error: unknown) { return mapExecutionErrorToHttpResponse(error); }
}
