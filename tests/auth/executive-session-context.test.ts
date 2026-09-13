import {
  afterAll,
  describe,
  expect,
  it
} from "vitest";

import {
  db
} from "../../src/lib/db";

import {
  ExecutiveAuthenticationError,
  hashSessionToken,
  resolveAuthenticatedExecutiveContext
} from "../../src/lib/auth/executive-session-context";

const suffix =
  `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

const organizationId =
  `auth-org-${suffix}`;

const userId =
  `auth-user-${suffix}`;

const validToken =
  `valid-session-${suffix}`;

describe(
  "authenticated executive session context",
  () => {
    it(
      "derives authenticated user and organization from the session cookie",
      async () => {
        await db.organization.create({
          data: {
            id: organizationId,
            name: "Auth Test Org"
          }
        });

        await db.user.create({
          data: {
            id: userId,
            email:
              `${userId}@example.test`,
            name:
              "Auth Test User",
            timezone:
              "Europe/Istanbul"
          }
        });

        await db.organizationMember.create({
          data: {
            organizationId,
            userId,
            role: "OWNER"
          }
        });

        await db.session.create({
          data: {
            userId,
            tokenHash:
              hashSessionToken(
                validToken
              ),
            rememberMe: true,
            expiresAt:
              new Date(
                Date.now() +
                  24 * 60 * 60 * 1000
              )
          }
        });

        const request =
          new Request(
            "http://localhost/api/metrix",
            {
              headers: {
                cookie:
                  `metrix_session=${validToken}`
              }
            }
          );

        const context =
          await resolveAuthenticatedExecutiveContext(
            request
          );

        expect(context).toMatchObject({
          actorUserId:
            userId,
          organizationId,
          timezone:
            "Europe/Istanbul"
        });

        expect(
          context.referenceTimeIso
        ).toMatch(
          /^\d{4}-\d{2}-\d{2}T/
        );
      }
    );

    it(
      "rejects a missing session",
      async () => {
        const request =
          new Request(
            "http://localhost/api/metrix"
          );

        await expect(
          resolveAuthenticatedExecutiveContext(
            request
          )
        ).rejects.toMatchObject({
          code:
            "UNAUTHENTICATED",
          status:
            401
        });
      }
    );

    it(
      "rejects an expired session",
      async () => {
        const expiredToken =
          `expired-${suffix}`;

        await db.session.create({
          data: {
            userId,
            tokenHash:
              hashSessionToken(
                expiredToken
              ),
            rememberMe: false,
            expiresAt:
              new Date(
                Date.now() -
                  60_000
              )
          }
        });

        const request =
          new Request(
            "http://localhost/api/metrix",
            {
              headers: {
                cookie:
                  `metrix_session=${expiredToken}`
              }
            }
          );

        await expect(
          resolveAuthenticatedExecutiveContext(
            request
          )
        ).rejects.toBeInstanceOf(
          ExecutiveAuthenticationError
        );
      }
    );

    it(
      "rejects a revoked session",
      async () => {
        const revokedToken =
          `revoked-${suffix}`;

        await db.session.create({
          data: {
            userId,
            tokenHash:
              hashSessionToken(
                revokedToken
              ),
            rememberMe: true,
            expiresAt:
              new Date(
                Date.now() +
                  24 * 60 * 60 * 1000
              ),
            revokedAt:
              new Date()
          }
        });

        const request =
          new Request(
            "http://localhost/api/metrix",
            {
              headers: {
                cookie:
                  `metrix_session=${revokedToken}`
              }
            }
          );

        await expect(
          resolveAuthenticatedExecutiveContext(
            request
          )
        ).rejects.toMatchObject({
          code:
            "UNAUTHENTICATED",
          status:
            401
        });
      }
    );
  }
);

afterAll(async () => {
  await db.session.deleteMany({
    where: {
      userId
    }
  });

  await db.organizationMember.deleteMany({
    where: {
      organizationId
    }
  });

  await db.organization.deleteMany({
    where: {
      id: organizationId
    }
  });

  await db.user.deleteMany({
    where: {
      id: userId
    }
  });

  await db.$disconnect();
});
