import {
  afterAll,
  describe,
  expect,
  it
} from "vitest";

import { db } from "../../src/lib/db";

import {
  executeTaskCreate
} from "../../src/lib/actions/task-create";

import {
  listTasksForOrganization
} from "../../src/lib/data/task-list";

// Root-cause regression for the physical Reality Gate finding: a task
// created without an explicit assignee (no such input exists today) used
// to leave assignedToUserId permanently null, so task_list's own
// assignedToMe filter — the exact filter "görevlerim" resolves to — could
// never find a task the actor had just created for themselves. Fixed at
// the canonical deterministic runtime (task-create.ts defaults
// assignedToUserId to the creating actor), not in voice instructions or
// the Live delegation bridge. This proves the default end to end through
// the same two functions the canonical tool dispatcher calls, and proves
// it does not weaken tenant or cross-user isolation.
describe(
  "task_create defaults assignedToUserId so assignedToMe finds a self-created task",
  () => {
    it(
      "a freshly created task with no explicit assignee is found by its creator's assignedToMe query, but not by a different member of the same organization, and not across organizations",
      async () => {
        const suffix =
          `${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}`;

        const organizationAId =
          `task-assign-org-a-${suffix}`;

        const organizationBId =
          `task-assign-org-b-${suffix}`;

        const creatorUserId =
          `task-assign-creator-${suffix}`;

        const otherMemberUserId =
          `task-assign-other-member-${suffix}`;

        const otherOrgUserId =
          `task-assign-other-org-${suffix}`;

        await db.organization.createMany({
          data: [
            {
              id: organizationAId,
              name: "Task Assignment Org A"
            },
            {
              id: organizationBId,
              name: "Task Assignment Org B"
            }
          ]
        });

        await db.user.createMany({
          data: [
            {
              id: creatorUserId,
              email: `${creatorUserId}@example.test`
            },
            {
              id: otherMemberUserId,
              email: `${otherMemberUserId}@example.test`
            },
            {
              id: otherOrgUserId,
              email: `${otherOrgUserId}@example.test`
            }
          ]
        });

        await db.organizationMember.createMany({
          data: [
            {
              organizationId: organizationAId,
              userId: creatorUserId,
              role: "MEMBER"
            },
            {
              organizationId: organizationAId,
              userId: otherMemberUserId,
              role: "MEMBER"
            },
            {
              organizationId: organizationBId,
              userId: otherOrgUserId,
              role: "MEMBER"
            }
          ]
        });

        try {
          const created = await executeTaskCreate({
            actorUserId: creatorUserId,
            organizationId: organizationAId,
            idempotencyKey: `task-assign-create-${suffix}`,
            title: `Assignment default task ${suffix}`,
            priority: "HIGH"
          });

          expect(created.verified).toBe(true);
          expect(created.task.assignedToUserId).toBe(
            creatorUserId
          );

          // A separate, unassigned task in the other tenant — proves the
          // creator's own query never crosses organization boundaries,
          // not merely that no task happens to exist there.
          await db.task.create({
            data: {
              organizationId: organizationBId,
              title: `Other org task ${suffix}`,
              createdByUserId: otherOrgUserId,
              assignedToUserId: otherOrgUserId
            }
          });

          const foundByCreator =
            await listTasksForOrganization({
              actorUserId: creatorUserId,
              organizationId: organizationAId,
              assignedToMe: true
            });

          expect(
            foundByCreator.map(task => task.id)
          ).toContain(created.task.id);

          expect(foundByCreator).toHaveLength(1);

          // Same organization, different member — the task is assigned
          // to the creator, not to them, so it must not appear.
          const foundByOtherMember =
            await listTasksForOrganization({
              actorUserId: otherMemberUserId,
              organizationId: organizationAId,
              assignedToMe: true
            });

          expect(
            foundByOtherMember.map(task => task.id)
          ).not.toContain(created.task.id);

          expect(foundByOtherMember).toHaveLength(0);

          // The other organization's own assignedToMe query must never
          // see anything from organization A.
          const foundInOtherOrg =
            await listTasksForOrganization({
              actorUserId: otherOrgUserId,
              organizationId: organizationBId,
              assignedToMe: true
            });

          expect(
            foundInOtherOrg.map(task => task.id)
          ).not.toContain(created.task.id);
        } finally {
          await db.actionExecution.deleteMany({
            where: {
              organizationId: {
                in: [organizationAId, organizationBId]
              }
            }
          });

          await db.task.deleteMany({
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
                in: [
                  creatorUserId,
                  otherMemberUserId,
                  otherOrgUserId
                ]
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
        }
      }
    );
  }
);

afterAll(async () => {
  await db.$disconnect();
});
