import { beforeEach, describe, expect, it, vi } from "vitest";

const { listActiveNotificationRecipientRecordsMock } = vi.hoisted(() => ({
  listActiveNotificationRecipientRecordsMock: vi.fn(),
}));

vi.mock("../organization-member.repository", () => ({
  listActiveNotificationRecipientRecords: listActiveNotificationRecipientRecordsMock,
}));

import { isSelfReference, normalizeTurkish, resolveOrganizationMemberByName, resolveRepByName } from "../member-name-resolution";

describe("normalizeTurkish", () => {
  it("folds Turkish diacritics and lowercases", () => {
    expect(normalizeTurkish("İnşaat Şirketi Ömer Çağ")).toBe("insaatsirketiomercag");
  });

  it("strips punctuation (including '.') but keeps @/+ and digits", () => {
    expect(normalizeTurkish("Ahmet Yılmaz #2 (satış@ örnek.com) +90")).toBe("ahmetyilmaz2satis@ornekcom+90");
  });
});

describe("isSelfReference", () => {
  it.each(["ben", "benim", "kendim", "kendi", "Kendi raporumu", "BENİM siparişim"])("recognizes '%s' as a self reference", (value) => {
    expect(isSelfReference(value)).toBe(true);
  });

  it("does not treat an unrelated name as a self reference", () => {
    expect(isSelfReference("Ahmet Yılmaz")).toBe(false);
  });
});

describe("resolveOrganizationMemberByName", () => {
  const members = [
    { userId: "user-1", fullName: "Ahmet Yılmaz" },
    { userId: "user-2", fullName: "Ahmet Kara" },
    { userId: "user-3", fullName: null },
  ];

  it("resolves an exact (diacritic-insensitive) match", () => {
    const result = resolveOrganizationMemberByName(members, "ahmet yilmaz");
    expect(result).toEqual({ status: "RESOLVED", member: { userId: "user-1", fullName: "Ahmet Yılmaz" } });
  });

  it("prefers an exact match over a partial one when both exist", () => {
    const withPartial = [...members, { userId: "user-4", fullName: "Ahmet Yılmaz Junior" }];
    const result = resolveOrganizationMemberByName(withPartial, "Ahmet Yılmaz");
    expect(result).toEqual({ status: "RESOLVED", member: { userId: "user-1", fullName: "Ahmet Yılmaz" } });
  });

  it("falls back to a partial match when no exact match exists", () => {
    const result = resolveOrganizationMemberByName(members, "Yılmaz");
    expect(result).toEqual({ status: "RESOLVED", member: { userId: "user-1", fullName: "Ahmet Yılmaz" } });
  });

  it("returns AMBIGUOUS when multiple members share the same partial name", () => {
    const result = resolveOrganizationMemberByName(members, "Ahmet");
    expect(result.status).toBe("AMBIGUOUS");
    if (result.status === "AMBIGUOUS") expect(result.options.map((m) => m.fullName)).toEqual(["Ahmet Yılmaz", "Ahmet Kara"]);
  });

  it("returns NOT_FOUND when nothing matches, ignoring members with no fullName", () => {
    expect(resolveOrganizationMemberByName(members, "Bilinmeyen Kişi")).toEqual({ status: "NOT_FOUND" });
  });

  it("caps AMBIGUOUS options at 5", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ userId: `user-${i}`, fullName: `Test Kişi ${i}` }));
    const result = resolveOrganizationMemberByName(many, "Test");
    expect(result.status).toBe("AMBIGUOUS");
    if (result.status === "AMBIGUOUS") expect(result.options).toHaveLength(5);
  });
});

describe("resolveRepByName", () => {
  const authContext = (userId = "user-1", fullName: string | null = "Murat Arda") => ({
    user: { id: userId, fullName },
    organization: { id: "org-1" },
  } as never);

  beforeEach(() => listActiveNotificationRecipientRecordsMock.mockReset());

  it("resolves a self reference to the actor without querying members", async () => {
    const result = await resolveRepByName(authContext("user-1", "Murat Arda"), "kendim");
    expect(result).toEqual({ status: "RESOLVED", userId: "user-1", fullName: "Murat Arda" });
    expect(listActiveNotificationRecipientRecordsMock).not.toHaveBeenCalled();
  });

  it("falls back to 'Siz' when the actor has no fullName", async () => {
    const result = await resolveRepByName(authContext("user-1", null), "ben");
    expect(result).toEqual({ status: "RESOLVED", userId: "user-1", fullName: "Siz" });
  });

  it("resolves a named colleague by querying active members", async () => {
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([{ userId: "user-2", fullName: "Ahmet Yılmaz", role: "EMPLOYEE" }]);
    const result = await resolveRepByName(authContext(), "Ahmet");
    expect(result).toEqual({ status: "RESOLVED", userId: "user-2", fullName: "Ahmet Yılmaz" });
  });

  it("maps NOT_FOUND to REP_NOT_FOUND", async () => {
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([]);
    const result = await resolveRepByName(authContext(), "Bilinmeyen Kişi");
    expect(result).toEqual({ status: "REP_NOT_FOUND" });
  });

  it("maps AMBIGUOUS to REP_AMBIGUOUS with fullName options", async () => {
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([
      { userId: "user-2", fullName: "Ahmet Yılmaz", role: "EMPLOYEE" },
      { userId: "user-3", fullName: "Ahmet Kara", role: "EMPLOYEE" },
    ]);
    const result = await resolveRepByName(authContext(), "Ahmet");
    expect(result).toEqual({ status: "REP_AMBIGUOUS", options: ["Ahmet Yılmaz", "Ahmet Kara"] });
  });
});
