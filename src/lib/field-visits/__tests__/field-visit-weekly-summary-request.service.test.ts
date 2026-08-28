import { beforeEach, describe, expect, it, vi } from "vitest";

const { listActiveNotificationRecipientRecordsMock, listFieldVisitsMock, listPaymentsMock } = vi.hoisted(() => ({
  listActiveNotificationRecipientRecordsMock: vi.fn(),
  listFieldVisitsMock: vi.fn(),
  listPaymentsMock: vi.fn(),
}));

vi.mock("@/lib/core/organization-members/organization-member.repository", () => ({
  listActiveNotificationRecipientRecords: listActiveNotificationRecipientRecordsMock,
}));
vi.mock("@/lib/core/field-visits/field-visit.service", () => ({ listFieldVisits: listFieldVisitsMock }));
vi.mock("@/lib/core/payments/payment.service", () => ({ listPayments: listPaymentsMock }));

import { resolveFieldVisitWeeklySummaryRequest } from "../field-visit-weekly-summary-request.service";

const authContext = (role: string, userId = "user-1") => ({
  user: { id: userId },
  organization: { id: "org-1" },
  membership: { role },
} as never);

describe("resolveFieldVisitWeeklySummaryRequest", () => {
  beforeEach(() => {
    listActiveNotificationRecipientRecordsMock.mockReset();
    listFieldVisitsMock.mockReset().mockResolvedValue([]);
    listPaymentsMock.mockReset().mockResolvedValue([]);
  });

  it("resolves the actor's own week when targetReference is null", async () => {
    const result = await resolveFieldVisitWeeklySummaryRequest({ authContext: authContext("EMPLOYEE"), targetReference: null });
    expect(result.status).toBe("ALLOWED");
    if (result.status === "ALLOWED") {
      expect(result.scope).toBe("SELF");
      expect(listFieldVisitsMock).toHaveBeenCalledWith(expect.objectContaining({ repUserId: "user-1" }));
    }
  });

  it("resolves the actor's own week for a self-referencing phrase", async () => {
    const result = await resolveFieldVisitWeeklySummaryRequest({ authContext: authContext("EMPLOYEE"), targetReference: "kendi" });
    expect(result.status).toBe("ALLOWED");
    if (result.status === "ALLOWED") expect(result.scope).toBe("SELF");
  });

  it("denies a plain EMPLOYEE asking for the team", async () => {
    const result = await resolveFieldVisitWeeklySummaryRequest({ authContext: authContext("EMPLOYEE"), targetReference: "ekip" });
    expect(result).toEqual({ status: "DENIED" });
    expect(listActiveNotificationRecipientRecordsMock).not.toHaveBeenCalled();
  });

  it("allows a MANAGER to see the team", async () => {
    const result = await resolveFieldVisitWeeklySummaryRequest({ authContext: authContext("MANAGER"), targetReference: "takım" });
    expect(result.status).toBe("ALLOWED");
    if (result.status === "ALLOWED") {
      expect(result.scope).toBe("TEAM");
      expect(listFieldVisitsMock).toHaveBeenCalledWith(expect.objectContaining({ repUserId: undefined }));
    }
  });

  it("resolves a named colleague and denies a plain EMPLOYEE from seeing them", async () => {
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([{ userId: "user-2", fullName: "Ahmet Yılmaz", role: "EMPLOYEE" }]);
    const result = await resolveFieldVisitWeeklySummaryRequest({ authContext: authContext("EMPLOYEE"), targetReference: "Ahmet Yılmaz" });
    expect(result).toEqual({ status: "DENIED" });
  });

  it("resolves a named colleague and allows a MANAGER to see them", async () => {
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([{ userId: "user-2", fullName: "Ahmet Yılmaz", role: "EMPLOYEE" }]);
    const result = await resolveFieldVisitWeeklySummaryRequest({ authContext: authContext("MANAGER"), targetReference: "Ahmet" });
    expect(result.status).toBe("ALLOWED");
    if (result.status === "ALLOWED") {
      expect(result.scope).toBe("COLLEAGUE");
      expect(result.repFullName).toBe("Ahmet Yılmaz");
      expect(listFieldVisitsMock).toHaveBeenCalledWith(expect.objectContaining({ repUserId: "user-2" }));
    }
  });

  it("returns NOT_FOUND for a name with no match, without leaking a DENIED for an unresolvable name", async () => {
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([{ userId: "user-2", fullName: "Ahmet Yılmaz", role: "EMPLOYEE" }]);
    const result = await resolveFieldVisitWeeklySummaryRequest({ authContext: authContext("MANAGER"), targetReference: "Bilinmeyen Kişi" });
    expect(result).toEqual({ status: "NOT_FOUND" });
  });

  it("returns AMBIGUOUS when multiple members share the same partial name", async () => {
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([
      { userId: "user-2", fullName: "Ahmet Yılmaz", role: "EMPLOYEE" },
      { userId: "user-3", fullName: "Ahmet Kara", role: "EMPLOYEE" },
    ]);
    const result = await resolveFieldVisitWeeklySummaryRequest({ authContext: authContext("MANAGER"), targetReference: "Ahmet" });
    expect(result.status).toBe("AMBIGUOUS");
    if (result.status === "AMBIGUOUS") expect(result.options).toEqual(["Ahmet Yılmaz", "Ahmet Kara"]);
  });
});
