import { buildCustomerUpdateRuntimeRiskContext } from "@/lib/action-runtime/domains/customers";
import { buildQuoteUpdateRuntimeRiskContext } from "@/lib/action-runtime/domains/quotes";
import { registerCapability, type CapabilityDescriptor } from "../capability-registry";

/**
 * WRITE capabilities for the representative business domains. Every
 * `nativeActionName` here must already exist in the real action-runtime
 * registry (src/lib/action-runtime/registry/manifests/*) — this file only
 * gives the existing action a stable, business-semantic capability id and
 * (for customer.update, the regression-acceptance domain) a stronger
 * field-level readback check. It registers no new mutation logic.
 *
 * Some business-semantic names intentionally differ from the native action
 * name: "settlement.create" is the real "payment.apply" action (Settlement
 * IS the collection event payment.apply produces — see settlement.service.ts
 * applySettlement). Capabilities are not fabricated for actions that don't
 * exist (e.g. there is no generic invoice/task field-update action — only
 * their real lifecycle transitions are registered below).
 */

function shallowFieldMismatch(expected: Record<string, unknown>, actual: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(expected)) {
    if (value === undefined) continue;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const nestedActual = actual[key];
      if (typeof nestedActual !== "object" || nestedActual === null) return `${key}: expected object, got ${String(nestedActual)}`;
      const nested = shallowFieldMismatch(value as Record<string, unknown>, nestedActual as Record<string, unknown>);
      if (nested) return `${key}.${nested}`;
      continue;
    }
    if (actual[key] !== value) return `${key}: expected ${String(value)}, got ${String(actual[key])}`;
  }
  return null;
}

const writeDescriptors: CapabilityDescriptor[] = [
  {
    capabilityId: "customer.create",
    domain: "customer",
    classification: "WRITE",
    implementation: { kind: "WRITE", nativeActionName: "customer.create", readbackCapability: "customer.read" },
  },
  {
    capabilityId: "customer.update",
    domain: "customer",
    classification: "WRITE",
    implementation: {
      kind: "WRITE",
      nativeActionName: "customer.update",
      resolveEntityRef: (payload) => (typeof payload.customerId === "string" ? { entityType: "customer", entityId: payload.customerId } : undefined),
      readbackCapability: "customer.read",
      resolveRuntimeRiskContext: (payload) => buildCustomerUpdateRuntimeRiskContext((payload.patch as Record<string, unknown> | undefined) ?? {}),
      verifyExpectedState: (payload, readEntity) => {
        const patch = payload.patch;
        if (!patch || typeof patch !== "object") return null;
        return shallowFieldMismatch(patch as Record<string, unknown>, readEntity);
      },
    },
  },
  {
    capabilityId: "customer.archive",
    domain: "customer",
    classification: "WRITE",
    implementation: {
      kind: "WRITE",
      nativeActionName: "customer.archive",
      resolveEntityRef: (payload) => (typeof payload.customerId === "string" ? { entityType: "customer", entityId: payload.customerId } : undefined),
      readbackCapability: "customer.read",
      runtimeRiskContext: { externalSideEffect: false, reversibilityClass: "REVERSIBLE" },
    },
  },
  {
    capabilityId: "quote.create",
    domain: "quote",
    classification: "WRITE",
    implementation: { kind: "WRITE", nativeActionName: "quote.create", readbackCapability: "quote.read" },
  },
  {
    capabilityId: "quote.update",
    domain: "quote",
    classification: "WRITE",
    implementation: {
      kind: "WRITE",
      nativeActionName: "quote.update",
      resolveEntityRef: (payload) => (typeof payload.quoteId === "string" ? { entityType: "quote", entityId: payload.quoteId } : undefined),
      readbackCapability: "quote.read",
      resolveRuntimeRiskContext: (payload) => buildQuoteUpdateRuntimeRiskContext((payload.patch as Record<string, unknown> | undefined) ?? {}),
    },
  },
  {
    capabilityId: "quote.send",
    domain: "quote",
    classification: "WRITE",
    implementation: {
      kind: "WRITE",
      nativeActionName: "quote.send",
      resolveEntityRef: (payload) => (typeof payload.quoteId === "string" ? { entityType: "quote", entityId: payload.quoteId } : undefined),
      readbackCapability: "quote.read",
      runtimeRiskContext: { changedFields: ["status"], externalSideEffect: false, reversibilityClass: "CORRECTABLE" },
    },
  },
  {
    capabilityId: "order.create",
    domain: "order",
    classification: "WRITE",
    implementation: { kind: "WRITE", nativeActionName: "order.create", readbackCapability: "order.read" },
  },
  {
    capabilityId: "order.update",
    domain: "order",
    classification: "WRITE",
    implementation: {
      kind: "WRITE",
      nativeActionName: "order.transitionStatus",
      resolveEntityRef: (payload) => (typeof payload.orderId === "string" ? { entityType: "order", entityId: payload.orderId } : undefined),
      readbackCapability: "order.read",
    },
  },
  {
    capabilityId: "order.cancel",
    domain: "order",
    classification: "WRITE",
    implementation: {
      kind: "WRITE",
      nativeActionName: "order.cancel",
      resolveEntityRef: (payload) => (typeof payload.orderId === "string" ? { entityType: "order", entityId: payload.orderId } : undefined),
      readbackCapability: "order.read",
    },
  },
  {
    capabilityId: "invoice.create",
    domain: "invoice",
    classification: "WRITE",
    implementation: { kind: "WRITE", nativeActionName: "invoice.create", readbackCapability: "invoice.read" },
  },
  {
    capabilityId: "invoice.send",
    domain: "invoice",
    classification: "WRITE",
    implementation: {
      kind: "WRITE",
      nativeActionName: "invoice.send",
      resolveEntityRef: (payload) => (typeof payload.invoiceId === "string" ? { entityType: "invoice", entityId: payload.invoiceId } : undefined),
      readbackCapability: "invoice.read",
      runtimeRiskContext: { changedFields: ["status"], externalSideEffect: false, reversibilityClass: "CORRECTABLE" },
    },
  },
  {
    capabilityId: "invoice.void",
    domain: "invoice",
    classification: "WRITE",
    implementation: {
      kind: "WRITE",
      nativeActionName: "invoice.void",
      resolveEntityRef: (payload) => (typeof payload.invoiceId === "string" ? { entityType: "invoice", entityId: payload.invoiceId } : undefined),
      readbackCapability: "invoice.read",
    },
  },
  {
    capabilityId: "settlement.create",
    domain: "settlement",
    classification: "WRITE",
    // Real action is "payment.apply" — see settlement.service.ts applySettlement.
    // Always EXPLICIT/CONDITIONAL-approved (see payment-apply-gateway.ts) —
    // this capability is only ever executed via ExecuteCanonicalOperationDeps.approvalContext.
    implementation: {
      kind: "WRITE",
      nativeActionName: "payment.apply",
      resolveEntityRef: (payload) => (typeof payload.paymentId === "string" ? { entityType: "payment", entityId: payload.paymentId } : undefined),
      runtimeRiskContext: { externalSideEffect: false, reversibilityClass: "IRREVERSIBLE" },
    },
  },
  {
    capabilityId: "settlement.reverse",
    domain: "settlement",
    classification: "WRITE",
    implementation: {
      kind: "WRITE",
      nativeActionName: "settlement.reverse",
      resolveEntityRef: (payload) => (typeof payload.settlementId === "string" ? { entityType: "settlement", entityId: payload.settlementId } : undefined),
    },
  },
  {
    capabilityId: "task.create",
    domain: "task",
    classification: "WRITE",
    implementation: { kind: "WRITE", nativeActionName: "task.create", readbackCapability: "task.read" },
  },
  {
    capabilityId: "task.complete",
    domain: "task",
    classification: "WRITE",
    implementation: {
      kind: "WRITE",
      nativeActionName: "task.complete",
      resolveEntityRef: (payload) => (typeof payload.taskId === "string" ? { entityType: "task", entityId: payload.taskId } : undefined),
      readbackCapability: "task.read",
      runtimeRiskContext: { externalSideEffect: false, reversibilityClass: "REVERSIBLE" },
    },
  },
  {
    capabilityId: "task.cancel",
    domain: "task",
    classification: "WRITE",
    implementation: {
      kind: "WRITE",
      nativeActionName: "task.cancel",
      resolveEntityRef: (payload) => (typeof payload.taskId === "string" ? { entityType: "task", entityId: payload.taskId } : undefined),
      readbackCapability: "task.read",
    },
  },
  {
    capabilityId: "inventory.receive",
    domain: "stock",
    classification: "WRITE",
    implementation: { kind: "WRITE", nativeActionName: "stock.receive", readbackCapability: "inventory.position" },
  },
  {
    capabilityId: "inventory.transfer",
    domain: "stock",
    classification: "WRITE",
    implementation: { kind: "WRITE", nativeActionName: "stock.transfer" },
  },
  {
    capabilityId: "inventory.adjust",
    domain: "stock",
    classification: "WRITE",
    implementation: { kind: "WRITE", nativeActionName: "stock.adjustment" },
  },
  {
    capabilityId: "calendar.create",
    domain: "calendar",
    classification: "WRITE",
    implementation: { kind: "WRITE", nativeActionName: "calendar_event.create", readbackCapability: "calendar.read" },
  },
  {
    capabilityId: "calendar.update",
    domain: "calendar",
    classification: "WRITE",
    implementation: {
      kind: "WRITE",
      nativeActionName: "calendar_event.update",
      resolveEntityRef: (payload) => (typeof payload.eventId === "string" ? { entityType: "calendar_event", entityId: payload.eventId } : undefined),
      readbackCapability: "calendar.read",
    },
  },
  {
    capabilityId: "calendar.reschedule",
    domain: "calendar",
    classification: "WRITE",
    implementation: {
      kind: "WRITE",
      nativeActionName: "calendar_event.reschedule",
      resolveEntityRef: (payload) => (typeof payload.eventId === "string" ? { entityType: "calendar_event", entityId: payload.eventId } : undefined),
      readbackCapability: "calendar.read",
    },
  },
  {
    capabilityId: "team.update",
    domain: "team",
    classification: "WRITE",
    implementation: {
      kind: "WRITE",
      nativeActionName: "organization_member.update",
      resolveEntityRef: (payload) => (typeof payload.memberId === "string" ? { entityType: "organization_member", entityId: payload.memberId } : undefined),
      readbackCapability: "team.read",
    },
  },
];

export function registerWriteCapabilities(): void {
  for (const descriptor of writeDescriptors) registerCapability(descriptor);
}
