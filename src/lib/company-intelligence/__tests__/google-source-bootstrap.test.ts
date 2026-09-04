import { beforeEach, describe, expect, it, vi } from "vitest";

const { registerSourceMock, registerConnectorAdapterMock, getConnectorAdapterMock } = vi.hoisted(() => ({
  registerSourceMock: vi.fn(),
  registerConnectorAdapterMock: vi.fn(),
  getConnectorAdapterMock: vi.fn(),
}));

vi.mock("../source-registry", () => ({ registerSource: registerSourceMock }));
vi.mock("../connector-gateway", () => ({ registerConnectorAdapter: registerConnectorAdapterMock, getConnectorAdapter: getConnectorAdapterMock }));
// google-source-bootstrap.ts imports google-connector-adapter.ts, which
// transitively imports the real Prisma client (throws without DATABASE_URL)
// — stubbed here since nothing in this file's tests exercises Prisma.
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: { gmailConnection: { count: vi.fn() } } }));

import { ensureGoogleConnectorAdapterRegistered, ensureGoogleSourceRegistered } from "../google-source-bootstrap";

describe("ensureGoogleSourceRegistered", () => {
  beforeEach(() => registerSourceMock.mockReset());

  it("declares both Gmail and Calendar fact scopes as READ-capable and explicitly NOT write-capable — this is what makes resolveWriteRoute return NO_AUTHORITY for them, never a fallback", async () => {
    registerSourceMock.mockResolvedValue({ id: "src-google" });
    await ensureGoogleSourceRegistered("org-1");
    const input = registerSourceMock.mock.calls[0][0];
    expect(input.provider).toBe("GOOGLE");
    expect(input.capabilities).toEqual([
      { id: "email.recentMessages", read: true, write: false },
      { id: "calendar.upcomingEvents", read: true, write: false },
      { id: "calendar.range", read: true, write: false },
    ]);
  });

  it("declares calendar.range with no write capability either — same no-fallback guarantee as the other Google fact scopes", async () => {
    registerSourceMock.mockResolvedValue({ id: "src-google" });
    await ensureGoogleSourceRegistered("org-1");
    const input = registerSourceMock.mock.calls[0][0];
    const calendarRange = input.capabilities.find((capability: { id: string }) => capability.id === "calendar.range");
    expect(calendarRange).toEqual({ id: "calendar.range", read: true, write: false });
  });

  it("declares Google as READ-only authoritative — no WRITE or BOTH applicability rule exists for either fact scope", async () => {
    registerSourceMock.mockResolvedValue({ id: "src-google" });
    await ensureGoogleSourceRegistered("org-1");
    const input = registerSourceMock.mock.calls[0][0];
    for (const rule of input.authoritativeScopes) {
      expect(rule.applicability).toBe("READ");
    }
  });

  it("is idempotent per organization — same call shape regardless of how many times it's invoked", async () => {
    registerSourceMock.mockResolvedValue({ id: "src-google" });
    await ensureGoogleSourceRegistered("org-1");
    await ensureGoogleSourceRegistered("org-1");
    expect(registerSourceMock).toHaveBeenCalledTimes(2);
    expect(registerSourceMock.mock.calls[0][0]).toEqual(registerSourceMock.mock.calls[1][0]);
  });
});

describe("ensureGoogleConnectorAdapterRegistered", () => {
  beforeEach(() => {
    registerConnectorAdapterMock.mockReset();
    getConnectorAdapterMock.mockReset();
  });

  it("registers the adapter only once — skips when a GOOGLE adapter is already registered", () => {
    getConnectorAdapterMock.mockReturnValue(undefined);
    ensureGoogleConnectorAdapterRegistered();
    expect(registerConnectorAdapterMock).toHaveBeenCalledTimes(1);

    getConnectorAdapterMock.mockReturnValue({ provider: "GOOGLE" });
    ensureGoogleConnectorAdapterRegistered();
    expect(registerConnectorAdapterMock).toHaveBeenCalledTimes(1);
  });
});
