import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { productionExecutionRuntime } from "@/lib/action-runtime/composition/production-execution-runtime";
import { buildExecutionContext } from "@/lib/action-runtime/gateway/execution-context";
import { buildActionExecutionRequest } from "@/lib/action-runtime/gateway/execution-request";
import { prisma } from "@/lib/core/shared/prisma";
import type {
  BusinessCandidatePromotionExecution,
  BusinessCandidatePromotionExecutor,
} from "./contracts";

export function createBusinessCandidateActionRuntimeExecutor(
  auth: AuthContext,
): BusinessCandidatePromotionExecutor {
  return async (input) => {
    assertActorScope(auth, input.organizationId);
    const action = await buildCanonicalAction(input);
    const result = await productionExecutionRuntime.executeAction(
      buildActionExecutionRequest({
        actionName: action.actionName,
        input: action.input,
        ...(action.entityRef ? { entityRef: action.entityRef } : {}),
        executionContext: buildExecutionContext(auth),
        idempotencyKey: input.idempotencyKey,
        correlationId: `business-candidate:${input.candidateId}`,
        runtimeRiskContext: {
          changedFields: input.approvedChanges.map((change) => change.fieldPath),
          externalSideEffect: false,
          reversibilityClass: action.reversibilityClass,
        },
      }),
    );

    const targetRecordId = result.entityRef?.entityId ?? input.targetRecordId;
    if (!targetRecordId) throw new Error("BUSINESS_CANDIDATE_EXECUTION_TARGET_MISSING");
    return {
      executionId: result.executionId,
      targetRecordId,
      canonicalOperation: action.actionName,
      success: result.status === "SUCCESS",
      ...(result.status === "SUCCESS" ? {} : { errorCode: result.outcome }),
    } satisfies BusinessCandidatePromotionExecution;
  };
}

async function buildCanonicalAction(
  input: Parameters<BusinessCandidatePromotionExecutor>[0],
): Promise<Readonly<{
  actionName: string;
  input: Record<string, unknown>;
  entityRef?: Readonly<{ entityType: string; entityId: string }>;
  reversibilityClass: "REVERSIBLE" | "CORRECTABLE";
}>> {
  if (input.targetDomain === "Customer" && input.operation === "CREATE") {
    return buildCustomerCreateAction(input);
  }
  if (
    input.targetDomain === "Customer"
    || input.targetDomain === "CustomerCommercialTerms"
    || input.targetDomain === "CustomerContact"
  ) {
    return buildCustomerUpdateAction(input);
  }
  if (input.targetDomain === "CompanyProfile" || input.targetDomain === "company") {
    const patch: Record<string, unknown> = {};
    for (const change of input.approvedChanges) {
      patch[change.fieldPath.replace(/^company(Profile)?\./i, "")] = change.proposedValue;
    }
    if (!Object.keys(patch).length) throw new Error("BUSINESS_CANDIDATE_HAS_NO_EXECUTABLE_CHANGES");
    return {
      actionName: "company.profile.update",
      input: { candidateId: input.candidateId, patch },
      ...(input.targetRecordId ? { entityRef: { entityType: "company_profile", entityId: input.targetRecordId } } : {}),
      reversibilityClass: "CORRECTABLE" as const,
    };
  }
  if (input.targetDomain === "CompanyUnit") {
    return buildCompanyCandidateAction(input, input.operation === "CREATE" ? "company.unit.create" : "company.unit.update");
  }
  if (input.targetDomain === "CustomFieldDefinition") return buildCompanyCandidateAction(input, "company.field_definition.create");
  if (input.targetDomain === "CompanyDynamicFieldValue") return buildCompanyCandidateAction(input, "company.field_value.write");
  if (input.targetDomain === "SalesGoal") return buildCompanyCandidateAction(input, "company.goal.upsert");
  if (input.targetDomain === "ProductService" && input.operation === "CREATE") {
    return buildProductCreateAction(input);
  }
  if (input.targetDomain === "Invoice" && input.operation === "CREATE") {
    return buildInvoiceCreateAction(input);
  }
  if (input.targetDomain === "Supplier" && input.operation === "CREATE") {
    return buildSupplierCreateAction(input);
  }
  if (input.targetDomain === "Supplier" && input.operation === "UPDATE") {
    return buildSupplierUpdateAction(input);
  }
  if (input.targetDomain === "Payment" && input.operation === "CREATE") {
    return buildPaymentCreateAction(input);
  }
  if (input.targetDomain === "Quote" && input.operation === "CREATE") {
    return buildQuoteCreateAction(input);
  }
  if (input.targetDomain === "ExecutiveAction" && input.operation === "CREATE") {
    return buildExecutiveActionCreate(input);
  }
  throw new Error("BUSINESS_CANDIDATE_UNSUPPORTED_CANONICAL_OPERATION");
}

function buildCompanyCandidateAction(
  input: Parameters<BusinessCandidatePromotionExecutor>[0],
  actionName: "company.unit.create" | "company.unit.update" | "company.field_definition.create" | "company.field_value.write" | "company.goal.upsert",
) {
  const values = Object.fromEntries(input.approvedChanges.map((change) => [change.fieldPath.replace(/^(company(Unit)?|goal|fieldDefinition|fieldValue)\./i, ""), change.proposedValue]));
  return {
    actionName,
    input: { candidateId: input.candidateId, values, ...(input.targetRecordId ? { targetRecordId: input.targetRecordId } : {}) },
    ...(input.targetRecordId ? { entityRef: { entityType: input.targetDomain, entityId: input.targetRecordId } } : {}),
    reversibilityClass: "CORRECTABLE" as const,
  };
}

async function buildCustomerUpdateAction(
  input: Parameters<BusinessCandidatePromotionExecutor>[0],
) {
  if (!input.targetRecordId) throw new Error("BUSINESS_CANDIDATE_TARGET_UNRESOLVED");
  const customer = await prisma.customer.findFirst({
    where: {
      id: input.targetRecordId,
      organizationId: input.organizationId,
    },
    select: { id: true, updatedAt: true },
  });
  if (!customer) throw new Error("BUSINESS_CANDIDATE_TARGET_NOT_FOUND");
  const expectedVersion = provenanceString(input.provenance, "targetVersion");
  if (expectedVersion && customer.updatedAt.toISOString() !== expectedVersion) {
    throw new Error("BUSINESS_CANDIDATE_CANONICAL_CONFLICT");
  }

  const patch: Record<string, unknown> = {};
  for (const change of input.approvedChanges) {
    assignCustomerPatch(patch, change.fieldPath, change.proposedValue);
  }
  if (Object.keys(patch).length === 0) {
    throw new Error("BUSINESS_CANDIDATE_HAS_NO_EXECUTABLE_CHANGES");
  }

  return {
    actionName: "customer.update",
    input: {
      customerId: customer.id,
      patch,
      expectedVersion: expectedVersion ?? customer.updatedAt.toISOString(),
    },
    entityRef: { entityType: "customer", entityId: customer.id },
    reversibilityClass: "CORRECTABLE" as const,
  };
}

function buildProductCreateAction(
  input: Parameters<BusinessCandidatePromotionExecutor>[0],
) {
  const values = changeMap(input.approvedChanges);
  const name = requiredString(values, "name");
  return {
    actionName: "product.create",
    input: {
      candidateId: input.candidateId,
      name,
      type: optionalString(values, "type") ?? "PRODUCT",
      ...(optionalString(values, "category") ? { category: optionalString(values, "category") } : {}),
      ...(optionalString(values, "unit") ? { unit: optionalString(values, "unit") } : {}),
      ...(optionalString(values, "currency") ? { currency: optionalString(values, "currency") } : {}),
    },
    reversibilityClass: "REVERSIBLE" as const,
  };
}

function buildInvoiceCreateAction(
  input: Parameters<BusinessCandidatePromotionExecutor>[0],
) {
  const values = changeMap(input.approvedChanges);
  const customerId = requiredString(values, "customerId");
  const title = requiredString(values, "title");
  const amount = requiredNumber(values, "amount");
  return {
    actionName: "invoice.create",
    input: {
      candidateId: input.candidateId,
      customerId,
      title,
      amount,
      ...(optionalString(values, "invoiceNumber") ? { invoiceNumber: optionalString(values, "invoiceNumber") } : {}),
      ...(optionalNumber(values, "taxRate") !== undefined ? { taxRate: optionalNumber(values, "taxRate") } : {}),
      ...(optionalString(values, "currency") ? { currency: optionalString(values, "currency") } : {}),
      ...(optionalString(values, "dueDate") ? { dueDate: optionalString(values, "dueDate") } : {}),
    },
    reversibilityClass: "REVERSIBLE" as const,
  };
}

function buildSupplierCreateAction(
  input: Parameters<BusinessCandidatePromotionExecutor>[0],
) {
  const values = changeMap(input.approvedChanges);
  const displayName = requiredString(values, "displayName");
  return {
    actionName: "supplier.create",
    input: {
      candidateId: input.candidateId,
      displayName,
      ...(optionalString(values, "legalName") ? { legalName: optionalString(values, "legalName") } : {}),
      ...(optionalString(values, "phone") ? { phone: optionalString(values, "phone") } : {}),
      ...(optionalString(values, "email") ? { email: optionalString(values, "email") } : {}),
      ...(optionalString(values, "website") ? { website: optionalString(values, "website") } : {}),
      ...(optionalString(values, "taxNumber") ? { taxNumber: optionalString(values, "taxNumber") } : {}),
      ...(optionalString(values, "taxOffice") ? { taxOffice: optionalString(values, "taxOffice") } : {}),
      ...(optionalString(values, "currency") ? { currency: optionalString(values, "currency") } : {}),
    },
    reversibilityClass: "REVERSIBLE" as const,
  };
}

function buildSupplierUpdateAction(
  input: Parameters<BusinessCandidatePromotionExecutor>[0],
) {
  if (!input.targetRecordId) throw new Error("BUSINESS_CANDIDATE_TARGET_UNRESOLVED");
  const patch: Record<string, unknown> = {};
  for (const change of input.approvedChanges) {
    const field = change.fieldPath.replace(/^supplier\./, "");
    if (!["displayName", "legalName", "phone", "email", "website", "taxNumber", "taxOffice", "currency"].includes(field)) {
      throw new Error("BUSINESS_CANDIDATE_UNSUPPORTED_SUPPLIER_FIELD");
    }
    patch[field] = change.proposedValue;
  }
  if (!Object.keys(patch).length) throw new Error("BUSINESS_CANDIDATE_HAS_NO_EXECUTABLE_CHANGES");
  return {
    actionName: "supplier.update",
    input: { candidateId: input.candidateId, id: input.targetRecordId, patch },
    entityRef: { entityType: "supplier", entityId: input.targetRecordId },
    reversibilityClass: "CORRECTABLE" as const,
  };
}

function buildPaymentCreateAction(
  input: Parameters<BusinessCandidatePromotionExecutor>[0],
) {
  const values = changeMap(input.approvedChanges);
  const customerId = requiredString(values, "customerId");
  const title = requiredString(values, "title");
  const amount = requiredNumber(values, "amount");
  return {
    actionName: "payment.create",
    input: {
      candidateId: input.candidateId,
      customerId,
      title,
      amount,
      ...(optionalString(values, "currency") ? { currency: optionalString(values, "currency") } : {}),
      ...(optionalString(values, "dueDate") ? { dueDate: optionalString(values, "dueDate") } : {}),
    },
    reversibilityClass: "REVERSIBLE" as const,
  };
}

function buildQuoteCreateAction(
  input: Parameters<BusinessCandidatePromotionExecutor>[0],
) {
  const values = changeMap(input.approvedChanges);
  const customerId = requiredString(values, "customerId");
  const title = requiredString(values, "title");
  return {
    actionName: "quote.create",
    input: {
      candidateId: input.candidateId,
      customerId,
      title,
      ...(optionalNumber(values, "amount") !== undefined ? { amount: optionalNumber(values, "amount") } : {}),
      ...(optionalString(values, "currency") ? { currency: optionalString(values, "currency") } : {}),
    },
    reversibilityClass: "REVERSIBLE" as const,
  };
}

function buildCustomerCreateAction(
  input: Parameters<BusinessCandidatePromotionExecutor>[0],
) {
  const values = changeMap(input.approvedChanges);
  const displayName = requiredString(values, "displayName");
  return {
    actionName: "customer.create",
    input: {
      candidateId: input.candidateId,
      displayName,
      ...(optionalString(values, "legalName") ? { legalName: optionalString(values, "legalName") } : {}),
      ...(optionalString(values, "phone") ? { phone: optionalString(values, "phone") } : {}),
      ...(optionalString(values, "email") ? { email: optionalString(values, "email") } : {}),
      ...(optionalString(values, "taxNumber") ? { taxNumber: optionalString(values, "taxNumber") } : {}),
      ...(optionalString(values, "taxOffice") ? { taxOffice: optionalString(values, "taxOffice") } : {}),
      ...(optionalString(values, "cariKodu") ? { cariKodu: optionalString(values, "cariKodu") } : {}),
      ...(optionalString(values, "billingAddress") ? { billingAddress: { line1: optionalString(values, "billingAddress") } } : {}),
    },
    reversibilityClass: "REVERSIBLE" as const,
  };
}

function buildExecutiveActionCreate(
  input: Parameters<BusinessCandidatePromotionExecutor>[0],
) {
  const values = changeMap(input.approvedChanges);
  const title = requiredString(values, "title");
  const ownerType = optionalString(values, "ownerType") ?? "UNASSIGNED";
  if (!["USER", "PERSON", "UNASSIGNED"].includes(ownerType)) {
    throw new Error("BUSINESS_CANDIDATE_INVALID_OWNER_TYPE");
  }
  return {
    actionName: "executive_action.create",
    input: {
      candidateId: input.candidateId,
      title,
      reason: optionalString(values, "reason") ?? "User-approved business candidate",
      ownerType,
      ...(optionalString(values, "ownerId") ? { ownerId: optionalString(values, "ownerId") } : {}),
      ...(optionalString(values, "dueDate") ? { dueDate: optionalString(values, "dueDate") } : {}),
    },
    reversibilityClass: "REVERSIBLE" as const,
  };
}

function assignCustomerPatch(
  patch: Record<string, unknown>,
  rawPath: string,
  value: unknown,
): void {
  const path = rawPath.replace(/^customer\./, "");
  if (path.startsWith("commercialTerms.")) {
    const field = path.slice("commercialTerms.".length);
    if (!["paymentTermDays", "creditLimitCents", "defaultCurrency", "discountRateBasisPoints", "deliveryTerm", "notes"].includes(field)) {
      throw new Error("BUSINESS_CANDIDATE_UNSUPPORTED_CUSTOMER_FIELD");
    }
    const terms = (patch.commercialTerms ?? {}) as Record<string, unknown>;
    terms[field] = value;
    patch.commercialTerms = terms;
    return;
  }
  if (path.startsWith("primaryContact.")) {
    const field = path.slice("primaryContact.".length);
    if (!["fullName", "title", "phone", "email"].includes(field)) {
      throw new Error("BUSINESS_CANDIDATE_UNSUPPORTED_CUSTOMER_FIELD");
    }
    const contact = (patch.primaryContact ?? {}) as Record<string, unknown>;
    contact[field] = value;
    patch.primaryContact = contact;
    return;
  }
  if (!["displayName", "legalName", "phone", "email", "metrixNote", "tier", "healthScore", "currency", "cariKodu", "taxNumber", "taxOffice", "mersisNo", "tradeRegistryNo", "billingAddress", "shippingAddress", "eInvoiceEnabled", "eArchiveEnabled"].includes(path)) {
    throw new Error("BUSINESS_CANDIDATE_UNSUPPORTED_CUSTOMER_FIELD");
  }
  patch[path] = value;
}

function changeMap(
  changes: Parameters<BusinessCandidatePromotionExecutor>[0]["approvedChanges"],
): ReadonlyMap<string, unknown> {
  return new Map(changes.map((change) => [change.fieldPath, change.proposedValue]));
}

function requiredString(values: ReadonlyMap<string, unknown>, key: string): string {
  const value = optionalString(values, key);
  if (!value) throw new Error(`BUSINESS_CANDIDATE_REQUIRED_FIELD_${key.toUpperCase()}`);
  return value;
}

function optionalString(values: ReadonlyMap<string, unknown>, key: string): string | undefined {
  const value = values.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// Same comma-as-decimal-separator convention as
// invoice-management-conversation-extension.ts's parseAmount.
function requiredNumber(values: ReadonlyMap<string, unknown>, key: string): number {
  const value = optionalNumber(values, key);
  if (value === undefined) throw new Error(`BUSINESS_CANDIDATE_REQUIRED_FIELD_${key.toUpperCase()}`);
  return value;
}

function optionalNumber(values: ReadonlyMap<string, unknown>, key: string): number | undefined {
  const raw = values.get(key);
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const parsed = Number(raw.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function assertActorScope(auth: AuthContext, organizationId: string): void {
  if (auth.organization.id !== organizationId || auth.membership.organizationId !== organizationId) {
    throw new Error("BUSINESS_CANDIDATE_ORGANIZATION_SCOPE_VIOLATION");
  }
}

function provenanceString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" && candidate ? candidate : null;
}
