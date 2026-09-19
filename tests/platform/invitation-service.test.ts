import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), create: vi.fn(), remove: vi.fn() }));

vi.mock("../../src/lib/db", () => ({
  db: {
    platformInvitation: { findFirst: mocks.findFirst, create: mocks.create, delete: mocks.remove },
    accessApplication: { findUnique: vi.fn(), create: vi.fn() },
    notification: { createMany: vi.fn() },
    user: { findMany: vi.fn() }
  }
}));

import { createPlatformInvitation, InvitationConflictError } from "../../src/lib/platform/access-service";

describe("platform invitation persistence boundary", () => {
  it("hashes the raw token before persistence and passes only the activation URL to the mail boundary", async () => {
    mocks.findFirst.mockResolvedValueOnce(null);
    mocks.create.mockImplementationOnce(async ({ data }) => ({ id: "invite-1", ...data }));
    const sendEmail = vi.fn().mockResolvedValue(undefined);
    const result = await createPlatformInvitation({ name: "Ayşe Demir", company: "Demir AŞ", email: "AYSE@EXAMPLE.COM" }, "admin-1", { baseUrl: "https://metrix.test", sendEmail });
    const rawToken = new URL(result.url).searchParams.get("token");
    expect(mocks.create.mock.calls[0][0].data.email).toBe("ayse@example.com");
    expect(mocks.create.mock.calls[0][0].data.tokenHash).not.toBe(rawToken);
    expect(mocks.create.mock.calls[0][0].data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "ayse@example.com", subject: "METRIX'e davet edildiniz" }));
  });

  it("does not create a second active invitation for the same normalized email", async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: "already-pending" });
    await expect(createPlatformInvitation({ company: "Demir AŞ", email: "ayse@example.com" }, "admin-1", { sendEmail: vi.fn() })).rejects.toBeInstanceOf(InvitationConflictError);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
