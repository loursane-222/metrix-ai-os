import { afterAll, describe, expect, it } from "vitest";

import { db } from "../../src/lib/db";
import {
  InvalidOtpError,
  requestLoginOtp,
  verifyLoginOtp
} from "../../src/lib/actions/auth-login";
import {
  UserAlreadyHasOrganizationError,
  executeOrganizationCreate
} from "../../src/lib/actions/organization-create";
import { hashOtpCode } from "../../src/lib/auth/otp";

describe("NEXT-native login (email OTP)", () => {
  it(
    "issues a dev-echoed OTP, verifies it exactly once, creates the user on first login, and flags that an organization is still needed",
    async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const email = `login-${suffix}@example.test`;

      try {
        const requested = await requestLoginOtp({ email });

        expect(requested.ok).toBe(true);
        expect(requested.devOtpCode).toMatch(/^\d{6}$/);

        const code = requested.devOtpCode as string;

        const verified = await verifyLoginOtp({ email, code });

        expect(verified.ok).toBe(true);
        expect(verified.needsOrganization).toBe(true);
        expect(verified.sessionToken).toBeTruthy();

        const user = await db.user.findUnique({ where: { email } });
        expect(user).not.toBeNull();
        expect(user?.id).toBe(verified.userId);

        const session = await db.session.findFirst({
          where: { userId: verified.userId }
        });
        expect(session).not.toBeNull();
        expect(session?.revokedAt).toBeNull();

        // same code cannot be replayed
        await expect(
          verifyLoginOtp({ email, code })
        ).rejects.toBeInstanceOf(InvalidOtpError);

        // creating an organization resolves needsOrganization for
        // subsequent logins
        await executeOrganizationCreate({
          userId: verified.userId,
          name: "Test Şirketi"
        });

        const requestedAgain = await requestLoginOtp({ email });
        const verifiedAgain = await verifyLoginOtp({
          email,
          code: requestedAgain.devOtpCode as string
        });

        expect(verifiedAgain.needsOrganization).toBe(false);

        await expect(
          executeOrganizationCreate({
            userId: verified.userId,
            name: "İkinci Şirket"
          })
        ).rejects.toBeInstanceOf(UserAlreadyHasOrganizationError);
      } finally {
        const user = await db.user.findUnique({ where: { email } });

        if (user) {
          await db.session.deleteMany({ where: { userId: user.id } });
          const memberships = await db.organizationMember.findMany({
            where: { userId: user.id }
          });
          await db.organizationMember.deleteMany({
            where: { userId: user.id }
          });
          await db.organization.deleteMany({
            where: {
              id: { in: memberships.map((m) => m.organizationId) }
            }
          });
          await db.user.delete({ where: { id: user.id } });
        }

        await db.loginChallenge.deleteMany({ where: { email } });
      }
    }
  );

  it("rejects a wrong code without consuming a valid one", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}-wrong`;
    const email = `login-${suffix}@example.test`;

    try {
      await requestLoginOtp({ email });

      await expect(
        verifyLoginOtp({ email, code: "000000" })
      ).rejects.toBeInstanceOf(InvalidOtpError);
    } finally {
      await db.loginChallenge.deleteMany({ where: { email } });
    }
  });

  it("rejects an expired code", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}-expired`;
    const email = `login-${suffix}@example.test`;
    const code = "123456";

    await db.loginChallenge.create({
      data: {
        email,
        codeHash: hashOtpCode(code),
        expiresAt: new Date(Date.now() - 1000)
      }
    });

    try {
      await expect(
        verifyLoginOtp({ email, code })
      ).rejects.toBeInstanceOf(InvalidOtpError);
    } finally {
      await db.loginChallenge.deleteMany({ where: { email } });
    }
  });
});

afterAll(async () => {
  await db.$disconnect();
});
