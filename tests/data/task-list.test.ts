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
  OrganizationAccessDeniedError
} from "../../src/lib/auth/organization-access";

import {
  listTasksForOrganization
} from "../../src/lib/data/task-list";

const suffix =
  `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

const orgA =
  `task-list-org-a-${suffix}`;

const orgB =
  `task-list-org-b-${suffix}`;

const userA =
  `task-list-user-a-${suffix}`;

const userB =
  `task-list-user-b-${suffix}`;

const otherUserA =
  `task-list-other-user-a-${suffix}`;

describe(
  "tenant-safe task list/read",
  () => {
    it(
      "returns only the authorized organization's tasks, filtered, ordered, and bounded",
      async () => {
        await db.organization.createMany({
          data: [
            { id: orgA, name: "Task List A" },
            { id: orgB, name: "Task List B" }
          ]
        });

        await db.user.createMany({
          data: [
            {
              id: userA,
              email: `${userA}@example.test`,
              name: "User A"
            },
            {
              id: userB,
              email: `${userB}@example.test`,
              name: "User B"
            },
            {
              id: otherUserA,
              email: `${otherUserA}@example.test`,
              name: "Other User A"
            }
          ]
        });

        await db.organizationMember.createMany({
          data: [
            {
              organizationId: orgA,
              userId: userA,
              role: "MEMBER"
            },
            {
              organizationId: orgA,
              userId: otherUserA,
              role: "MEMBER"
            },
            {
              organizationId: orgB,
              userId: userB,
              role: "MEMBER"
            }
          ]
        });

        await db.task.create({
          data: {
            organizationId: orgA,
            title: "A - Açık yüksek öncelik, geciken",
            status: "OPEN",
            priority: "HIGH",
            dueAt: new Date("2020-01-01T00:00:00.000Z"),
            createdByUserId: userA
          }
        });

        await db.task.create({
          data: {
            organizationId: orgA,
            title: "A - Tamamlanmış görev",
            status: "DONE",
            priority: "HIGH",
            createdByUserId: userA
          }
        });

        await db.task.create({
          data: {
            organizationId: orgA,
            title: "A - Düşük öncelik, başka kullanıcı",
            status: "OPEN",
            priority: "LOW",
            createdByUserId: otherUserA
          }
        });

        await db.task.create({
          data: {
            organizationId: orgB,
            title: "B - Açık yüksek öncelik, geciken",
            status: "OPEN",
            priority: "HIGH",
            dueAt: new Date("2020-01-01T00:00:00.000Z"),
            createdByUserId: userB
          }
        });

        const allInOrgA =
          await listTasksForOrganization({
            actorUserId: userA,
            organizationId: orgA
          });

        expect(allInOrgA).toHaveLength(3);

        expect(
          allInOrgA.some(
            task => task.organizationId === orgB
          )
        ).toBe(false);

        const openHighInOrgA =
          await listTasksForOrganization({
            actorUserId: userA,
            organizationId: orgA,
            status: "OPEN",
            priority: "HIGH"
          });

        expect(openHighInOrgA).toHaveLength(1);

        expect(
          openHighInOrgA[0]?.title
        ).toBe(
          "A - Açık yüksek öncelik, geciken"
        );

        const overdueInOrgA =
          await listTasksForOrganization({
            actorUserId: userA,
            organizationId: orgA,
            status: "OPEN",
            dueBefore:
              "2026-01-01T00:00:00.000Z"
          });

        expect(overdueInOrgA).toHaveLength(1);

        expect(
          overdueInOrgA[0]?.title
        ).toBe(
          "A - Açık yüksek öncelik, geciken"
        );

        const createdByMe =
          await listTasksForOrganization({
            actorUserId: userA,
            organizationId: orgA,
            createdByMe: true
          });

        expect(createdByMe).toHaveLength(2);

        expect(
          createdByMe.every(
            task =>
              task.title.startsWith("A -")
          )
        ).toBe(true);

        const titleSearch =
          await listTasksForOrganization({
            actorUserId: userA,
            organizationId: orgA,
            titleContains: "düşük öncelik"
          });

        expect(titleSearch).toHaveLength(1);

        expect(
          titleSearch[0]?.title
        ).toBe(
          "A - Düşük öncelik, başka kullanıcı"
        );

        const noResult =
          await listTasksForOrganization({
            actorUserId: userA,
            organizationId: orgA,
            titleContains: "hiç eşleşmeyecek metin"
          });

        expect(noResult).toEqual([]);

        const orderedIds =
          allInOrgA.map(task => task.id);

        const reorderedIds =
          [...allInOrgA]
            .sort(
              (a, b) =>
                a.createdAt < b.createdAt
                  ? 1
                  : -1
            )
            .map(task => task.id);

        expect(orderedIds).toEqual(
          reorderedIds
        );

        expect(
          JSON.stringify(allInOrgA)
        ).not.toMatch(
          /actorUserId|idempotencyKey|createdByUserId/
        );
      }
    );

    it(
      "rejects an actor without organization membership",
      async () => {
        await expect(
          listTasksForOrganization({
            actorUserId: userB,
            organizationId: orgA
          })
        ).rejects.toBeInstanceOf(
          OrganizationAccessDeniedError
        );
      }
    );

    it(
      "distinguishes assignedToMe from createdByMe and never leaks another user's or org's assignment",
      async () => {
        const assignedToUserA =
          await db.task.create({
            data: {
              organizationId: orgA,
              title:
                "Başkasının oluşturup bana atadığı görev",
              status: "OPEN",
              priority: "MEDIUM",
              createdByUserId: otherUserA,
              assignedToUserId: userA
            }
          });

        const createdByUserAAssignedElsewhere =
          await db.task.create({
            data: {
              organizationId: orgA,
              title:
                "Benim oluşturup başkasına atadığım görev",
              status: "OPEN",
              priority: "MEDIUM",
              createdByUserId: userA,
              assignedToUserId: otherUserA
            }
          });

        const assignedToOtherUserInSameOrg =
          await db.task.create({
            data: {
              organizationId: orgA,
              title:
                "Aynı organizasyonda başkasına atanmış görev",
              status: "OPEN",
              priority: "MEDIUM",
              createdByUserId: otherUserA,
              assignedToUserId: otherUserA
            }
          });

        await db.task.create({
          data: {
            organizationId: orgB,
            title:
              "Başka organizasyonda bana atanmış gibi görünen görev",
            status: "OPEN",
            priority: "MEDIUM",
            createdByUserId: userB,
            assignedToUserId: userA
          }
        });

        const assignedToMe =
          await listTasksForOrganization({
            actorUserId: userA,
            organizationId: orgA,
            assignedToMe: true
          });

        const assignedToMeIds =
          assignedToMe.map(task => task.id);

        expect(assignedToMeIds).toContain(
          assignedToUserA.id
        );

        expect(assignedToMeIds).not.toContain(
          createdByUserAAssignedElsewhere.id
        );

        expect(assignedToMeIds).not.toContain(
          assignedToOtherUserInSameOrg.id
        );

        expect(
          assignedToMe.every(
            task => task.organizationId === orgA
          )
        ).toBe(true);

        const createdByMeAfter =
          await listTasksForOrganization({
            actorUserId: userA,
            organizationId: orgA,
            createdByMe: true
          });

        const createdByMeAfterIds =
          createdByMeAfter.map(task => task.id);

        expect(createdByMeAfterIds).toContain(
          createdByUserAAssignedElsewhere.id
        );

        expect(createdByMeAfterIds).not.toContain(
          assignedToUserA.id
        );

        const otherUsersAssignedView =
          await listTasksForOrganization({
            actorUserId: otherUserA,
            organizationId: orgA,
            assignedToMe: true
          });

        const otherUsersAssignedIds =
          otherUsersAssignedView.map(
            task => task.id
          );

        expect(
          otherUsersAssignedIds
        ).toContain(
          createdByUserAAssignedElsewhere.id
        );

        expect(
          otherUsersAssignedIds
        ).toContain(
          assignedToOtherUserInSameOrg.id
        );

        expect(
          otherUsersAssignedIds
        ).not.toContain(assignedToUserA.id);

        expect(
          JSON.stringify(assignedToMe)
        ).not.toMatch(
          /actorUserId|assignedToUserId|createdByUserId|idempotencyKey/
        );
      }
    );
  }
);

afterAll(async () => {
  await db.task.deleteMany({
    where: {
      organizationId: {
        in: [orgA, orgB]
      }
    }
  });

  await db.organizationMember.deleteMany({
    where: {
      organizationId: {
        in: [orgA, orgB]
      }
    }
  });

  await db.organization.deleteMany({
    where: {
      id: {
        in: [orgA, orgB]
      }
    }
  });

  await db.user.deleteMany({
    where: {
      id: {
        in: [userA, userB, otherUserA]
      }
    }
  });

  await db.$disconnect();
});
