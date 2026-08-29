import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeActionMock, buildExecutionContextMock } = vi.hoisted(() => ({
  executeActionMock: vi.fn(),
  buildExecutionContextMock: vi.fn(),
}));

vi.mock("@/lib/action-runtime/composition/production-execution-runtime", () => ({
  productionExecutionRuntime: { executeAction: executeActionMock },
}));
vi.mock("@/lib/action-runtime/gateway/execution-context", () => ({
  buildExecutionContext: buildExecutionContextMock,
}));
// buildCanonicalAction's Supplier/Customer UPDATE branches read prisma, but
// this test only exercises Payment CREATE, which never touches it — the
// mock exists purely so the module import doesn't require DATABASE_URL.
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));

import { createBusinessCandidateActionRuntimeExecutor } from "../business-candidate-action-runtime.executor";

const auth = { user: { id: "user-1" }, organization: { id: "org-1" }, membership: { organizationId: "org-1" } } as never;

const promotionInput = {
  candidateId: "candidate-1",
  organizationId: "org-1",
  targetDomain: "Payment",
  targetRecordId: null,
  operation: "CREATE" as const,
  provenance: {},
  approvedChanges: [
    { changeId: "c1", fieldPath: "customerId", proposedValue: "customer-1", previousValue: null },
    { changeId: "c2", fieldPath: "title", proposedValue: "Tahsilat", previousValue: null },
    { changeId: "c3", fieldPath: "amount", proposedValue: "10000", previousValue: null },
  ],
  idempotencyKey: "idem-1",
};

describe("createBusinessCandidateActionRuntimeExecutor extraPermissions", () => {
  beforeEach(() => {
    executeActionMock.mockReset().mockResolvedValue({ status: "SUCCESS", executionId: "exec-1", entityRef: { entityId: "payment-1" }, outcome: "SUCCEEDED" });
    buildExecutionContextMock.mockReset().mockReturnValue({ actorId: "user-1", organizationId: "org-1", role: "EMPLOYEE", permissions: ["customers.write"], sessionRef: "s1", issuedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-01-02T00:00:00.000Z" });
  });

  it("passes the base executionContext through unchanged when no extraPermissions are given (default, matches every existing caller)", async () => {
    const executor = createBusinessCandidateActionRuntimeExecutor(auth);
    await executor(promotionInput);

    const call = executeActionMock.mock.calls[0]![0];
    expect(call.executionContext.permissions).toEqual(["customers.write"]);
  });

  it("appends extraPermissions onto the base permissions without mutating the base list", async () => {
    const executor = createBusinessCandidateActionRuntimeExecutor(auth, ["orders.write", "payments.write"]);
    await executor(promotionInput);

    const call = executeActionMock.mock.calls[0]![0];
    expect(call.executionContext.permissions).toEqual(["customers.write", "orders.write", "payments.write"]);
  });
});
