import { beforeEach, describe, expect, it, vi } from "vitest";

const { materializeReceivableScheduleMock } = vi.hoisted(() => ({ materializeReceivableScheduleMock: vi.fn() }));
vi.mock("@/lib/core/obligations/obligation-schedule.service", () => ({ materializeReceivableSchedule: materializeReceivableScheduleMock }));

import { obligationMaterializeReceivableHandler } from "../obligation-materialize-receivable-handler";

const envelope = (input: Record<string, unknown>, entityRef: { entityType: string; entityId: string } | undefined = { entityType: "invoice", entityId: "invoice-1" }) => ({
  executionId: "exec-1",
  actionName: "obligation.materializeReceivable",
  input,
  entityRef,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["invoices.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("obligationMaterializeReceivableHandler", () => {
  beforeEach(() => materializeReceivableScheduleMock.mockReset());

  it("materializes through the canonical service with organization/actor taken only from trusted execution context", async () => {
    materializeReceivableScheduleMock.mockResolvedValue({ lines: [{ id: "line-1" }, { id: "line-2" }], payments: [{ id: "payment-1" }, { id: "payment-2" }] });

    const result = await obligationMaterializeReceivableHandler(envelope({ invoiceId: "invoice-1", organizationId: "attacker-org" }));

    expect(materializeReceivableScheduleMock).toHaveBeenCalledWith({ organizationId: "org-1", invoiceId: "invoice-1", actorId: "user-1" });
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "invoice", entityId: "invoice-1" }, metadata: { lineCount: 2 } });
  });

  it("rejects a missing invoiceId before calling the service", async () => {
    await expect(obligationMaterializeReceivableHandler(envelope({}))).rejects.toThrow(/invoiceId/);
    expect(materializeReceivableScheduleMock).not.toHaveBeenCalled();
  });

  it("rejects an entityRef that doesn't match the addressed invoice", async () => {
    await expect(
      obligationMaterializeReceivableHandler(envelope({ invoiceId: "invoice-1" }, { entityType: "invoice", entityId: "invoice-2" })),
    ).rejects.toThrow("ACTION_TARGET_CONTEXT_MISMATCH");
  });
});
