import { afterEach, describe, expect, it, vi } from "vitest";

import { db } from "../../src/lib/db";
import {
  InvalidOtpError,
  OTP_RATE_LIMIT_MAX_REQUESTS,
  OtpDeliveryError,
  OtpRateLimitedError,
  requestLoginOtp,
  verifyLoginOtp
} from "../../src/lib/actions/auth-login";

function uniqueEmail(tag: string): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `login-otp-${tag}-${suffix}@example.test`;
}

async function withProductionEnv<T>(fn: () => Promise<T>): Promise<T> {
  vi.stubEnv("NODE_ENV", "production");
  try {
    return await fn();
  } finally {
    vi.unstubAllEnvs();
  }
}

function spyOnConsole() {
  return [
    vi.spyOn(console, "log").mockImplementation(() => {}),
    vi.spyOn(console, "info").mockImplementation(() => {}),
    vi.spyOn(console, "warn").mockImplementation(() => {}),
    vi.spyOn(console, "error").mockImplementation(() => {}),
    vi.spyOn(console, "debug").mockImplementation(() => {})
  ];
}

describe("production OTP email delivery", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("sends the code by email, omits it from the response, and the delivered code verifies exactly once", async () => {
    const email = uniqueEmail("success");
    const sendEmail = vi.fn().mockResolvedValue(undefined);
    const consoleSpies = spyOnConsole();

    try {
      const result = await withProductionEnv(() =>
        requestLoginOtp({ email }, { sendEmail })
      );

      expect(result.ok).toBe(true);
      expect(result.devOtpCode).toBeUndefined();

      expect(sendEmail).toHaveBeenCalledTimes(1);
      const call = sendEmail.mock.calls[0]?.[0] as {
        to: string;
        subject: string;
        text: string;
      };
      expect(call.to).toBe(email);
      expect(call.subject.length).toBeGreaterThan(0);

      const match = call.text.match(/\b(\d{6})\b/);
      expect(match).not.toBeNull();
      const code = match?.[1] as string;

      for (const spy of consoleSpies) {
        expect(spy).not.toHaveBeenCalled();
      }

      const verified = await verifyLoginOtp({ email, code });
      expect(verified.ok).toBe(true);

      await expect(
        verifyLoginOtp({ email, code })
      ).rejects.toBeInstanceOf(InvalidOtpError);
    } finally {
      await db.loginChallenge.deleteMany({ where: { email } });
      const user = await db.user.findUnique({ where: { email } });
      if (user) {
        await db.session.deleteMany({ where: { userId: user.id } });
        await db.user.delete({ where: { id: user.id } });
      }
    }
  });

  it("does not return a false success and leaves no usable challenge when delivery fails", async () => {
    const email = uniqueEmail("failure");
    const sendEmail = vi.fn().mockRejectedValue(new Error("provider down"));
    const consoleSpies = spyOnConsole();

    try {
      await expect(
        withProductionEnv(() => requestLoginOtp({ email }, { sendEmail }))
      ).rejects.toBeInstanceOf(OtpDeliveryError);

      const remaining = await db.loginChallenge.findMany({
        where: { email }
      });
      expect(remaining).toHaveLength(0);

      for (const spy of consoleSpies) {
        expect(spy).not.toHaveBeenCalled();
      }
    } finally {
      await db.loginChallenge.deleteMany({ where: { email } });
    }
  });

  it("only removes the challenge created by the failed request, not other active challenges for the same email", async () => {
    const email = uniqueEmail("partial-failure");
    const okSend = vi.fn().mockResolvedValue(undefined);
    const failSend = vi.fn().mockRejectedValue(new Error("provider down"));

    try {
      await withProductionEnv(() =>
        requestLoginOtp({ email }, { sendEmail: okSend })
      );

      const survivingChallenge = await db.loginChallenge.findFirst({
        where: { email },
        orderBy: { createdAt: "desc" }
      });
      expect(survivingChallenge).not.toBeNull();

      await expect(
        withProductionEnv(() =>
          requestLoginOtp({ email }, { sendEmail: failSend })
        )
      ).rejects.toBeInstanceOf(OtpDeliveryError);

      const remaining = await db.loginChallenge.findMany({
        where: { email }
      });
      expect(remaining.map((c) => c.id)).toEqual([survivingChallenge?.id]);
    } finally {
      await db.loginChallenge.deleteMany({ where: { email } });
    }
  });
});

describe("OTP request rate limiting", () => {
  it("rejects requests once the burst threshold is exceeded", async () => {
    const email = uniqueEmail("rate-limit");

    try {
      for (let i = 0; i < OTP_RATE_LIMIT_MAX_REQUESTS; i += 1) {
        const result = await requestLoginOtp({ email });
        expect(result.ok).toBe(true);
      }

      await expect(requestLoginOtp({ email })).rejects.toBeInstanceOf(
        OtpRateLimitedError
      );
    } finally {
      await db.loginChallenge.deleteMany({ where: { email } });
    }
  });
});
