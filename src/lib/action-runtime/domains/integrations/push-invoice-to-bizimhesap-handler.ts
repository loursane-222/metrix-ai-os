import { findInvoiceById } from "@/lib/core/invoices/invoice.service";
import { getCustomerByIdForOrganization } from "@/lib/core/customers/customer.service";
import { pushInvoiceToBizimHesap } from "@/lib/integrations/bizimhesap/bizimhesap.service";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handlePushInvoiceToBizimHesap(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const invoiceId = requiredString(envelope.input.invoiceId, "invoiceId");
  const organizationId = envelope.executionContext.organizationId;

  const invoice = await findInvoiceById(invoiceId, organizationId);
  if (!invoice) throw new Error("Invoice not found.");
  if (!invoice.customerId) throw new Error("Invoice has no linked customer to push.");
  const customer = await getCustomerByIdForOrganization(invoice.customerId, organizationId);
  if (!customer) throw new Error("Invoice's customer not found.");

  const result = await pushInvoiceToBizimHesap({
    organizationId,
    invoice: {
      invoiceNumber: invoice.invoiceNumber,
      title: invoice.title,
      amount: Number(invoice.amount),
      taxRate: Number(invoice.taxRate),
      taxAmount: Number(invoice.taxAmount),
      totalAmount: Number(invoice.totalAmount),
      currency: invoice.currency,
      dueDate: invoice.dueDate,
    },
    customer: {
      id: customer.id,
      displayName: customer.displayName,
      legalName: customer.legalName,
      taxOffice: customer.taxOffice,
      taxNumber: customer.taxNumber,
      email: customer.email,
      phone: customer.phone,
      addressLine: formatAddressLine(customer.billingAddress),
    },
  });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "invoice", entityId: invoice.id },
    resultSummary: `Invoice pushed to BizimHesap (guid: ${result.guid}).`,
    metadata: { bizimHesapGuid: result.guid, bizimHesapUrl: result.url },
    domainEvents: [],
    sideEffects: [],
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

// CustomerAddressInput (customer.types.ts) is a deliberately free-form
// Record<string, unknown> — there is no canonical field set to rely on.
// Best-effort join of the common keys actually used across this codebase's
// address forms; never invents a value that isn't present.
function formatAddressLine(billingAddress: unknown): string | null {
  if (!billingAddress || typeof billingAddress !== "object") return null;
  const record = billingAddress as Record<string, unknown>;
  const parts = ["addressLine1", "addressLine2", "district", "city", "postalCode", "country"]
    .map((key) => record[key])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  return parts.length > 0 ? parts.join(", ") : null;
}
