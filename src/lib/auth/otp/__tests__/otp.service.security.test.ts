import { afterEach, describe, expect, it, vi } from "vitest";

const { createChallenge, findRecent, sendEmail } = vi.hoisted(() => ({
  createChallenge: vi.fn(),
  findRecent: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("../otp.repository", () => ({
  createOtpChallengeRecord: createChallenge,
  findRecentOtpChallengeByPhone: findRecent,
  findLatestOtpChallengeByPhone: vi.fn(),
  incrementOtpChallengeAttempts: vi.fn(),
  consumeOtpChallenge: vi.fn(),
}));
vi.mock("../email.service", () => ({ sendOtpEmail: sendEmail }));

import { AuthError } from "@/lib/auth/shared/auth.errors";
import { requestOtp } from "../otp.service";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("production OTP delivery", () => {
  it("fails closed and never returns the OTP when the provider fails", async () => {
    vi.stubEnv("NODE_ENV", "production");
    findRecent.mockResolvedValue(null);
    createChallenge.mockResolvedValue({ id: "challenge-1", expiresAt: new Date(Date.now() + 60_000) });
    sendEmail.mockRejectedValue(new Error("provider unavailable"));

    await expect(requestOtp({ phone: "owner@example.com" })).rejects.toMatchObject({
      status: 503,
    } satisfies Partial<AuthError>);
  });
});
