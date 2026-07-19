import { createNewCustomer } from "@/lib/core/customers/customer.service";
import type { ActionHandler } from "../../execution";
import { buildCustomerCreatedDomainEvent } from "./customer-domain-events";

const OPTIONAL_FIELDS = ["legalName", "phone", "email", "metrixNote", "tier", "currency", "cariKodu", "taxNumber", "taxOffice", "mersisNo", "tradeRegistryNo"] as const;

export const customerCreateHandler: ActionHandler = async (envelope) => {
  const displayName = envelope.input.displayName;
  if (typeof displayName !== "string" || !displayName.trim()) throw new Error("displayName is required.");
  const values: Record<string, string | undefined> = {};
  for (const field of OPTIONAL_FIELDS) {
    const value = envelope.input[field];
    if (value !== undefined && typeof value !== "string") throw new Error(`${field} must be a string.`);
    values[field] = typeof value === "string" && value.trim() ? value.trim() : undefined;
  }
  const customer = await createNewCustomer({
    organizationId: envelope.executionContext.organizationId,
    createdByUserId: envelope.executionContext.actorId,
    displayName: displayName.trim(),
    ...values,
    ...(typeof envelope.input.healthScore === "number" ? { healthScore: envelope.input.healthScore } : {}),
    ...(typeof envelope.input.eInvoiceEnabled === "boolean" ? { eInvoiceEnabled: envelope.input.eInvoiceEnabled } : {}),
    ...(typeof envelope.input.eArchiveEnabled === "boolean" ? { eArchiveEnabled: envelope.input.eArchiveEnabled } : {}),
    ...(isObject(envelope.input.billingAddress) ? { billingAddress: envelope.input.billingAddress } : {}),
    ...(isObject(envelope.input.shippingAddress) ? { shippingAddress: envelope.input.shippingAddress } : {}),
    ...(isObject(envelope.input.primaryContact) ? { primaryContact: envelope.input.primaryContact } : {}),
    ...(isObject(envelope.input.commercialTerms) ? { commercialTerms: normalizeCommercialTerms(envelope.input.commercialTerms) } : {}),
    ...(Array.isArray(envelope.input.customFields) ? { customFields: envelope.input.customFields.filter(isObject).map((item) => ({ definitionId: String(item.definitionId), value: item.value })) } : {}),
  });
  return {
    status: "SUCCESS",
    entityRef: { entityType: "customer", entityId: customer.id },
    resultSummary: "customer.create completed.",
    metadata: { customerId: customer.id },
    domainEvents: [buildCustomerCreatedDomainEvent(customer.id, envelope.executionContext.actorId)],
    sideEffects: [],
  };
};
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function normalizeCommercialTerms(value: Record<string, unknown>) { return { ...(typeof value.paymentTermDays === "number" ? { paymentTermDays: value.paymentTermDays } : {}), ...(typeof value.creditLimitCents === "number" ? { creditLimitCents: BigInt(value.creditLimitCents) } : {}), ...(typeof value.defaultCurrency === "string" ? { defaultCurrency: value.defaultCurrency } : {}), ...(typeof value.discountRateBasisPoints === "number" ? { discountRateBasisPoints: value.discountRateBasisPoints } : {}), ...(typeof value.deliveryTerm === "string" ? { deliveryTerm: value.deliveryTerm } : {}), ...(typeof value.notes === "string" ? { notes: value.notes } : {}) }; }
