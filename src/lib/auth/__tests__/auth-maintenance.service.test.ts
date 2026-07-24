import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionRepository = vi.hoisted(() => ({
  findSessionByTokenHash: vi.fn(),
  touchSessionRecord: vi.fn(),
  createSessionRecord: vi.fn(),
  revokeSessionByTokenHash: vi.fn(),
}));
const trustedDeviceRepository = vi.hoisted(() => ({
  findTrustedDeviceByTokenHash: vi.fn(),
  touchTrustedDeviceRecord: vi.fn(),
  createTrustedDeviceRecord: vi.fn(),
  revokeTrustedDeviceByTokenHash: vi.fn(),
}));

vi.mock("../sessions/session.repository", () => sessionRepository);
vi.mock(
  "../trusted-devices/trusted-device.repository",
  () => trustedDeviceRepository,
);

import {
  requireSessionToken,
  validateSessionToken,
} from "../sessions/session.service";
import { validateTrustedDeviceToken } from "../trusted-devices/trusted-device.service";

describe("deferred auth maintenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("still rejects an invalid session", async () => {
    sessionRepository.findSessionByTokenHash.mockResolvedValue(null);
    await expect(requireSessionToken("invalid", vi.fn())).rejects.toMatchObject({
      status: 401,
    });
  });

  it("returns a valid session before a failing touch write runs", async () => {
    const session = {
      id: "session-1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: "user-1" },
    };
    sessionRepository.findSessionByTokenHash.mockResolvedValue(session);
    sessionRepository.touchSessionRecord.mockRejectedValue(
      new Error("touch failed"),
    );
    const tasks: Array<() => Promise<void>> = [];

    await expect(
      validateSessionToken("valid", (task) => tasks.push(task)),
    ).resolves.toBe(session);
    expect(sessionRepository.touchSessionRecord).not.toHaveBeenCalled();
    await expect(tasks[0]()).resolves.toBeUndefined();
  });

  it("returns trusted-device validity before a failing touch write runs", async () => {
    trustedDeviceRepository.findTrustedDeviceByTokenHash.mockResolvedValue({
      id: "device-1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    trustedDeviceRepository.touchTrustedDeviceRecord.mockRejectedValue(
      new Error("touch failed"),
    );
    const tasks: Array<() => Promise<void>> = [];

    await expect(
      validateTrustedDeviceToken("valid", (task) => tasks.push(task)),
    ).resolves.toBe(true);
    expect(trustedDeviceRepository.touchTrustedDeviceRecord).not.toHaveBeenCalled();
    await expect(tasks[0]()).resolves.toBeUndefined();
  });
});
