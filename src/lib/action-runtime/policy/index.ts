import { createPolicyEngine, PolicyEngine } from "./policy-engine";
import { createApprovalService } from "./approval-service";
import { createInMemoryApprovalStore, createPrismaApprovalStore } from "./approval-store";

export * from "./policy.errors";
export * from "./policy.types";
export { DEFAULT_POLICY_CONFIG } from "./policy-config";
export type { PolicyConfig } from "./policy-config";
export { createInMemoryApprovalStore, createPrismaApprovalStore } from "./approval-store";
export type { ApprovalStore } from "./approval-store";
export { ApprovalService, createApprovalService } from "./approval-service";
export type { ApprovalServiceOptions } from "./approval-service";
export { evaluatePermissions } from "./permission-evaluator";
export type { PermissionEvaluationResult } from "./permission-evaluator";
export { computeRuntimeRisk } from "./risk-evaluator";
export { PolicyEngine, createPolicyEngine };

/**
 * Runtime tek bir uygulama-genelinde paylaşılabilir singleton olarak da
 * sağlanır; varsayılan olarak gerçek actionRegistry singleton'ıyla
 * konuşur. Page Context ve Draft Runtime'a hiçbir bağımlılık yoktur.
 */
export const policyEngine = createPolicyEngine({
  approvalService: createApprovalService({
    store: process.env.NODE_ENV === "test"
      ? createInMemoryApprovalStore()
      : createPrismaApprovalStore(async () => (await import("@/lib/core/shared/prisma")).prisma),
  }),
});
