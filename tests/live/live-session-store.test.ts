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
  bindOpenAiLiveSession,
  createLiveSessionBinding,
  loadLiveSessionBinding,
  markLiveSessionDisconnected,
  markLiveSidebandAttached
} from "../../src/lib/live/live-session-store";

const suffix =
  `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

const organizationAId =
  `live-session-org-a-${suffix}`;
const organizationBId =
  `live-session-org-b-${suffix}`;
const actorUserId =
  `live-session-actor-${suffix}`;
const sameOrganizationOutsiderId =
  `live-session-outsider-${suffix}`;

describe("trusted Live-session bindings", () => {
  it(
    "loads a bound session only for its stored actor and organization",
    async () => {
      await db.organization.createMany({
        data: [
          {
            id: organizationAId,
            name: "Live Session Organization A"
          },
          {
            id: organizationBId,
            name: "Live Session Organization B"
          }
        ]
      });

      await db.user.createMany({
        data: [
          {
            id: actorUserId,
            email: `${actorUserId}@example.test`
          },
          {
            id: sameOrganizationOutsiderId,
            email: `${sameOrganizationOutsiderId}@example.test`
          }
        ]
      });

      await db.organizationMember.createMany({
        data: [
          {
            organizationId: organizationAId,
            userId: actorUserId,
            role: "OWNER"
          },
          {
            organizationId: organizationAId,
            userId: sameOrganizationOutsiderId,
            role: "MEMBER"
          },
          {
            organizationId: organizationBId,
            userId: actorUserId,
            role: "OWNER"
          }
        ]
      });

      const binding =
        await createLiveSessionBinding({
          actorUserId,
          organizationId: organizationAId
        });

      expect(binding).toMatchObject({
        userId: actorUserId,
        organizationId: organizationAId,
        openAiSessionId: null,
        status: "BOOTSTRAPPING"
      });

      const bound =
        await bindOpenAiLiveSession({
          bindingId: binding.id,
          openAiSessionId: "live_test_1"
        });

      expect(bound).toMatchObject({
        id: binding.id,
        userId: actorUserId,
        organizationId: organizationAId,
        openAiSessionId: "live_test_1",
        status: "CONNECTED"
      });
      expect(bound.connectedAt).toBeInstanceOf(Date);
      expect(bound).not.toHaveProperty("clientSecret");

      await expect(
        loadLiveSessionBinding({
          bindingId: binding.id,
          actorUserId: sameOrganizationOutsiderId,
          organizationId: organizationAId
        })
      ).rejects.toMatchObject({
        code: "LIVE_SESSION_ACCESS_DENIED"
      });

      await expect(
        loadLiveSessionBinding({
          bindingId: binding.id,
          actorUserId,
          organizationId: organizationBId
        })
      ).rejects.toMatchObject({
        code: "LIVE_SESSION_ACCESS_DENIED"
      });

      await expect(
        loadLiveSessionBinding({
          bindingId: binding.id,
          actorUserId: sameOrganizationOutsiderId,
          organizationId: organizationBId
        })
      ).rejects.toMatchObject({
        code: "LIVE_SESSION_ACCESS_DENIED"
      });

      const loaded =
        await loadLiveSessionBinding({
          bindingId: binding.id,
          actorUserId,
          organizationId: organizationAId
        });

      expect(loaded).toMatchObject({
        id: binding.id,
        userId: actorUserId,
        organizationId: organizationAId,
        openAiSessionId: "live_test_1",
        status: "CONNECTED"
      });
    }
  );

  it(
    "records sideband attachment and disconnection lifecycle",
    async () => {
      const binding =
        await createLiveSessionBinding({
          actorUserId,
          organizationId:
            organizationAId
        });

      await bindOpenAiLiveSession({
        bindingId:
          binding.id,
        openAiSessionId:
          "live_sideband_lifecycle_test"
      });

      const attached =
        await markLiveSidebandAttached({
          bindingId:
            binding.id
        });

      expect(
        attached.status
      ).toBe(
        "CONNECTED"
      );

      expect(
        attached.sidebandAttachedAt
      ).toBeInstanceOf(
        Date
      );

      const disconnected =
        await markLiveSessionDisconnected({
          bindingId:
            binding.id
        });

      expect(
        disconnected.status
      ).toBe(
        "DISCONNECTED"
      );

      expect(
        disconnected.endedAt
      ).toBeInstanceOf(
        Date
      );
    }
  );
});

afterAll(async () => {
  await db.liveSession.deleteMany({
    where: {
      organizationId: {
        in: [organizationAId, organizationBId]
      }
    }
  });

  await db.organizationMember.deleteMany({
    where: {
      organizationId: {
        in: [organizationAId, organizationBId]
      }
    }
  });

  await db.user.deleteMany({
    where: {
      id: {
        in: [actorUserId, sameOrganizationOutsiderId]
      }
    }
  });

  await db.organization.deleteMany({
    where: {
      id: {
        in: [organizationAId, organizationBId]
      }
    }
  });

  await db.$disconnect();
});
