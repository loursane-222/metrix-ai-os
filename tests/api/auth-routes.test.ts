import { afterAll, describe, expect, it } from "vitest";

import { db } from "../../src/lib/db";
import { POST as otpRequestRoute } from "../../src/app/api/auth/otp/request/route";
import { POST as otpVerifyRoute } from "../../src/app/api/auth/otp/verify/route";
import { GET as sessionRoute } from "../../src/app/api/auth/session/route";
import { POST as logoutRoute } from "../../src/app/api/auth/logout/route";
import { POST as organizationsRoute } from "../../src/app/api/organizations/route";
import { METRIX_SESSION_COOKIE } from "../../src/lib/auth/executive-session-context";

function jsonRequest(body: unknown, cookie?: string): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: JSON.stringify(body)
  });
}

function extractCookieToken(setCookieHeader: string | null): string {
  expect(setCookieHeader).not.toBeNull();
  const match = setCookieHeader?.match(
    new RegExp(`${METRIX_SESSION_COOKIE}=([^;]+)`)
  );
  expect(match).not.toBeNull();
  return match?.[1] ?? "";
}

describe("NEXT-native auth API routes", () => {
  it(
    "full flow: request otp -> verify -> session -> organizations -> logout -> session revoked",
    async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const email = `route-login-${suffix}@example.test`;

      try {
        // Controlled access: OTP is now only available to an already
        // provisioned account; this fixture represents that approved user.
        await db.user.create({ data: { email } });
        const requestResponse = await otpRequestRoute(
          jsonRequest({ email })
        );
        const requestPayload = (await requestResponse.json()) as {
          ok: boolean;
          data: { devOtpCode: string };
        };

        expect(requestResponse.status).toBe(200);
        expect(requestPayload.ok).toBe(true);
        expect(requestPayload.data.devOtpCode).toMatch(/^\d{6}$/);

        const verifyResponse = await otpVerifyRoute(
          jsonRequest({
            email,
            code: requestPayload.data.devOtpCode
          })
        );
        const verifyPayload = (await verifyResponse.json()) as {
          ok: boolean;
          needsOrganization: boolean;
        };

        expect(verifyResponse.status).toBe(200);
        expect(verifyPayload.ok).toBe(true);
        expect(verifyPayload.needsOrganization).toBe(true);

        const token = extractCookieToken(
          verifyResponse.headers.get("set-cookie")
        );
        const cookieHeader = `${METRIX_SESSION_COOKIE}=${token}`;

        const sessionResponse = await sessionRoute(
          new Request("http://localhost/test", {
            headers: { Cookie: cookieHeader }
          })
        );
        const sessionPayload = (await sessionResponse.json()) as {
          authenticated: boolean;
          user: { email: string };
          organization: unknown;
        };

        expect(sessionPayload.authenticated).toBe(true);
        expect(sessionPayload.user.email).toBe(email);
        expect(sessionPayload.organization).toBeNull();

        const orgResponse = await organizationsRoute(
          jsonRequest(
            { organizationName: "Route Test Şirketi" },
            cookieHeader
          )
        );
        const orgPayload = (await orgResponse.json()) as {
          ok: boolean;
          organization: { name: string };
        };

        expect(orgResponse.status).toBe(200);
        expect(orgPayload.ok).toBe(true);
        expect(orgPayload.organization.name).toBe("Route Test Şirketi");

        const sessionAfterOrg = await sessionRoute(
          new Request("http://localhost/test", {
            headers: { Cookie: cookieHeader }
          })
        );
        const sessionAfterOrgPayload = (await sessionAfterOrg.json()) as {
          organization: { name: string } | null;
        };
        expect(sessionAfterOrgPayload.organization?.name).toBe(
          "Route Test Şirketi"
        );

        // a second organization is rejected via the route boundary too
        const secondOrgResponse = await organizationsRoute(
          jsonRequest({ organizationName: "İkinci" }, cookieHeader)
        );
        expect(secondOrgResponse.status).toBe(409);

        await logoutRoute(
          new Request("http://localhost/test", {
            method: "POST",
            headers: { Cookie: cookieHeader }
          })
        );

        const sessionAfterLogout = await sessionRoute(
          new Request("http://localhost/test", {
            headers: { Cookie: cookieHeader }
          })
        );
        const sessionAfterLogoutPayload =
          (await sessionAfterLogout.json()) as { authenticated: boolean };
        expect(sessionAfterLogoutPayload.authenticated).toBe(false);
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

  it("session route returns unauthenticated with no cookie", async () => {
    const response = await sessionRoute(
      new Request("http://localhost/test")
    );
    const payload = (await response.json()) as {
      authenticated: boolean;
    };

    expect(payload.authenticated).toBe(false);
  });

  it("organizations route rejects an unauthenticated request", async () => {
    const response = await organizationsRoute(
      jsonRequest({ organizationName: "Yetkisiz" })
    );

    expect(response.status).toBe(401);
  });

  it("does not issue an OTP for an unknown email address", async () => {
    const response = await otpRequestRoute(jsonRequest({ email: `unknown-${Date.now()}@example.test` }));
    const payload = (await response.json()) as { code: string };
    expect(response.status).toBe(403);
    expect(payload.code).toBe("ACCESS_NOT_APPROVED");
  });
});

afterAll(async () => {
  await db.$disconnect();
});
