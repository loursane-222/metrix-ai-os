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
  if (
    input.targetDomain === "Customer"
    || input.targetDomain === "CustomerCommercialTerms"
    || input.targetDomain === "CustomerContact"
  ) {
    return buildCustomerUpdateAction(input);
  }
  if (input.targetDomain === "ProductService" && input.operation === "CREATE") {
    return buildProductCreateAction(input);
  }
  if (input.targetDomain === "ExecutiveAction" && input.operation === "CREATE") {
    return buildExecutiveActionCreate(input);
  }
  throw new Error("BUSINESS_CANDIDATE_UNSUPPORTED_CANONICAL_OPERATION");
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
