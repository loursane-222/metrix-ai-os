import { describe, expect, it } from "vitest";
import { resolveNotificationRecipient, type NotificationRecipientCandidate } from "../notification-recipient-resolver";

const members: NotificationRecipientCandidate[] = [
  { userId: "ahmet", fullName: "Ahmet Yılmaz", role: "MANAGER" },
  { userId: "ayse", fullName: "Ayşe Kaya", role: "MANAGER" },
  { userId: "deniz", fullName: "Deniz Ak", role: "EMPLOYEE" },
];

describe("notification recipient resolution", () => {
  it("resolves an explicitly named organization member", () => {
    expect(resolveNotificationRecipient("Ahmet'e", members)).toMatchObject({ status: "RESOLVED", recipient: { userId: "ahmet" } });
  });
  it("resolves a role only when exactly one active member has it", () => {
    expect(resolveNotificationRecipient("çalışana", members)).toMatchObject({ status: "RESOLVED", recipient: { userId: "deniz" } });
  });
  it("returns every candidate instead of silently selecting the first role match", () => {
    expect(resolveNotificationRecipient("yöneticiye", members)).toEqual({ status: "AMBIGUOUS", candidates: members.slice(0, 2) });
  });
  it("does not project personal hierarchy language onto a generic manager role", () => {
    expect(resolveNotificationRecipient("yöneticim", members)).toEqual({ status: "UNRESOLVED", reason: "PERSONAL_HIERARCHY_UNAVAILABLE" });
  });
});
