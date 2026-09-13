import {
  afterAll,
  describe,
  expect,
  it
} from "vitest";

import {
  RunContext
} from "@openai/agents";

import {
  db
} from "../../src/lib/db";

import {
  createCustomerLookupTool
} from "../../src/lib/agent/tools/customer-lookup-tool";

const suffix =
  `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

const organizationId =
  `tool-lookup-org-${suffix}`;

const userId =
  `tool-lookup-user-${suffix}`;

describe(
  "customer_lookup executive tool",
  () => {
    it(
      "uses trusted context and returns grounded customer reality",
      async () => {
        await db.organization.create({
          data: {
            id: organizationId,
            name: "Tool Lookup Org"
          }
        });

        await db.user.create({
          data: {
            id: userId,
            email:
              `${userId}@example.test`,
            name: "Tool User"
          }
        });

        await db.organizationMember.create({
          data: {
            organizationId,
            userId,
            role: "MEMBER"
          }
        });

        await db.customer.create({
          data: {
            organizationId,
            name: "Belgin Tekstil",
            email: "belgin@example.test",
            externalId:
              `belgin-${suffix}`
          }
        });

        const customerLookup =
          createCustomerLookupTool();

        const context =
          new RunContext({
            actorUserId: userId,
            organizationId,
            turnId:
              `lookup-turn-${suffix}`
          });

        const raw =
          await customerLookup.invoke(
            context,
            JSON.stringify({
              query: "Belgin"
            })
          );

        const serialized =
          typeof raw === "string"
            ? raw
            : JSON.stringify(raw);

        expect(serialized).toContain(
          "Belgin Tekstil"
        );

        expect(serialized).toContain(
          "belgin@example.test"
        );

        expect(serialized).not.toContain(
          "VERIFIED"
        );
      }
    );
  }
);

afterAll(async () => {
  await db.customer.deleteMany({
    where: {
      organizationId
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
