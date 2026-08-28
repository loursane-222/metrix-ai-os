import { beforeEach, describe, expect, it, vi } from "vitest";

const { createNewFieldVisitMock, notifyWithOwnerFanoutMock } = vi.hoisted(() => ({
  createNewFieldVisitMock: vi.fn(),
  notifyWithOwnerFanoutMock: vi.fn(),
}));
vi.mock("@/lib/core/field-visits/field-visit.service", () => ({
  createNewFieldVisit: createNewFieldVisitMock,
}));
vi.mock("@/lib/core/notifications", () => ({
  notifyWithOwnerFanout: notifyWithOwnerFanoutMock,
}));

import { handleFieldVisitCreate } from "../field-visit-create-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "field_visit.create",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "EMPLOYEE", permissions: ["field_visits.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("handleFieldVisitCreate", () => {
  beforeEach(() => {
    createNewFieldVisitMock.mockReset();
    notifyWithOwnerFanoutMock.mockReset().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] });
  });

  it("creates a plain visit and does not notify when no request type is raised", async () => {
    createNewFieldVisitMock.mockResolvedValue({ id: "visit-1", customerId: "cust-1" });
    const result = await handleFieldVisitCreate(envelope({
      customerNameRaw: "Arde Yapı",
      startAt: "2026-08-29T09:00:00.000Z",
      endAt: "2026-08-29T11:00:00.000Z",
      notes: "Toplantı yapıldı.",
    }));
    expect(createNewFieldVisitMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      repUserId: "user-1",
      customerNameRaw: "Arde Yapı",
      requestTypes: [],
    }));
    expect(notifyWithOwnerFanoutMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "field_visit", entityId: "visit-1" } });
  });

  it("notifies the owner when the visit raises a real request", async () => {
    createNewFieldVisitMock.mockResolvedValue({ id: "visit-2", customerId: null });
    const result = await handleFieldVisitCreate(envelope({
      customerNameRaw: "Arde Yapı",
      startAt: "2026-08-29T09:00:00.000Z",
      requestTypes: ["DISPLAY_REQUEST"],
    }));
    expect(notifyWithOwnerFanoutMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      type: "field_visit.request_raised",
      entityType: "FieldVisit",
      entityId: "visit-2",
    }));
    expect(result.metadata).toMatchObject({ requestTypes: ["DISPLAY_REQUEST"] });
  });

  it("drops an unrecognized request type rather than passing it through blindly", async () => {
    createNewFieldVisitMock.mockResolvedValue({ id: "visit-3" });
    await handleFieldVisitCreate(envelope({
      customerNameRaw: "Arde Yapı",
      startAt: "2026-08-29T09:00:00.000Z",
      requestTypes: ["NOT_A_REAL_TYPE"],
    }));
    expect(createNewFieldVisitMock).toHaveBeenCalledWith(expect.objectContaining({ requestTypes: [] }));
    expect(notifyWithOwnerFanoutMock).not.toHaveBeenCalled();
  });

  it("rejects a missing customerNameRaw before mutation", async () => {
    await expect(handleFieldVisitCreate(envelope({ startAt: "2026-08-29T09:00:00.000Z" }))).rejects.toThrow(/customerNameRaw/);
    expect(createNewFieldVisitMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid startAt before mutation", async () => {
    await expect(handleFieldVisitCreate(envelope({ customerNameRaw: "Arde Yapı", startAt: "not-a-date" }))).rejects.toThrow(/startAt/);
    expect(createNewFieldVisitMock).not.toHaveBeenCalled();
  });
});
