import { beforeEach, describe, expect, it, vi } from "vitest";

const { materializePayableScheduleMock } = vi.hoisted(() => ({ materializePayableScheduleMock: vi.fn() }));
vi.mock("@/lib/core/obligations/obligation-schedule.service", () => ({ materializePayableSchedule: materializePayableScheduleMock }));

import { obligationMaterializePayableHandler } from "../obligation-materialize-payable-handler";

const envelope = (input: Record<string, unknown>, entityRef: { entityType: string; entityId: string } | undefined = { entityType: "expense", entityId: "expense-1" }) => ({
  executionId: "exec-1",
  actionName: "obligation.materializePayable",
  input,
  entityRef,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["expenses.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("obligationMaterializePayableHandler", () => {
  beforeEach(() => materializePayableScheduleMock.mockReset());

  it("materializes through the canonical service", async () => {
    materializePayableScheduleMock.mockResolvedValue({ line: { id: "line-1" }, expense: { id: "expense-1" } });

    const result = await obligationMaterializePayableHandler(envelope({ expenseId: "expense-1", dueDate: "2026-10-01T00:00:00.000Z" }));

    expect(materializePayableScheduleMock).toHaveBeenCalledWith({ organizationId: "org-1", expenseId: "expense-1", dueDate: new Date("2026-10-01T00:00:00.000Z"), actorId: "user-1" });
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "expense", entityId: "expense-1" }, metadata: { lineId: "line-1" } });
  });

  it("rejects a missing dueDate before calling the service", async () => {
    await expect(obligationMaterializePayableHandler(envelope({ expenseId: "expense-1" }))).rejects.toThrow(/dueDate/);
    expect(materializePayableScheduleMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid dueDate string", async () => {
    await expect(obligationMaterializePayableHandler(envelope({ expenseId: "expense-1", dueDate: "not-a-date" }))).rejects.toThrow(/dueDate/);
  });

  it("rejects an entityRef that doesn't match the addressed expense", async () => {
    await expect(
      obligationMaterializePayableHandler(envelope({ expenseId: "expense-1", dueDate: "2026-10-01T00:00:00.000Z" }, { entityType: "expense", entityId: "expense-2" })),
    ).rejects.toThrow("ACTION_TARGET_CONTEXT_MISMATCH");
  });
});
