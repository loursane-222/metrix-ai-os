import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseIntegration = process.env.RUN_DATABASE_INTEGRATION === "1" ? describe : describe.skip;

databaseIntegration("multi-organization isolation (real PostgreSQL)", () => {
  const suffix = randomUUID();
  let fixture: Awaited<ReturnType<typeof createFixture>>;

  beforeAll(async () => { fixture = await createFixture(suffix); });
  afterAll(async () => {
    const { prisma } = await import("@/lib/core/shared/prisma");
    if (fixture) {
      await prisma.actionIdempotencyRecord.deleteMany({ where: { scope: fixture.actionScope } });
      await prisma.organization.deleteMany({ where: { id: { in: [fixture.organizationA.id, fixture.organizationB.id] } } });
      await prisma.user.deleteMany({ where: { id: { in: [fixture.userA.id, fixture.userB.id] } } });
    }
    await prisma.$disconnect();
  });

  it("canonical business facts expose only organization A records", async () => {
    const { readCanonicalBusinessFactsForMessage } = await import("@/lib/canonical-business-facts/canonical-business-facts.service");
    const [facts] = await readCanonicalBusinessFactsForMessage({ organizationId: fixture.organizationA.id, message: "müşterileri listele" });

    expect(facts?.count).toBe(1);
    expect(facts?.records.map((record) => record.name)).toEqual(["ORG-A CUSTOMER"]);
    expect(JSON.stringify(facts)).not.toContain("ORG-B CUSTOMER");
  });

  it("Action Runtime with organization A context cannot mutate organization B", async () => {
    const { executeCustomerUpdateGateway } = await import("@/lib/action-runtime/gateway/customer-update-gateway");
    const { prisma } = await import("@/lib/core/shared/prisma");

    await expect(executeCustomerUpdateGateway({
      authContext: fixture.authContextA,
      customerId: fixture.customerB.id,
      expectedVersion: fixture.customerB.updatedAt.toISOString(),
      patch: { displayName: "CROSS-ORG MUTATION" },
      idempotencyKey: `multi-org-${suffix}`,
      correlationId: randomUUID(),
    })).rejects.toThrow(/customer\.update/u);

    await expect(prisma.customer.findFirst({ where: { id: fixture.customerB.id, organizationId: fixture.organizationB.id } })).resolves.toMatchObject({ displayName: "ORG-B CUSTOMER" });
    await expect(prisma.customer.findFirst({ where: { displayName: "CROSS-ORG MUTATION", organizationId: fixture.organizationA.id } })).resolves.toBeNull();
  });

  it("the /api/ai/chat history loaders cannot load organization B context for organization A", async () => {
    const { findConversationByIdForOrganization, findLastAiMessageByConversation, listRecentMessagesByConversation } = await import("@/lib/core/conversations/conversation.repository");

    await expect(findConversationByIdForOrganization(fixture.conversationB.id, fixture.organizationA.id, fixture.userA.id)).resolves.toBeNull();
    await expect(findLastAiMessageByConversation(fixture.conversationB.id, fixture.organizationA.id)).resolves.toBeNull();
    await expect(listRecentMessagesByConversation(fixture.conversationB.id, 20, fixture.organizationA.id)).resolves.toEqual([]);
  });
});

async function createFixture(suffix: string) {
  const { prisma } = await import("@/lib/core/shared/prisma");
  const { createSession } = await import("@/lib/auth/sessions/session.service");
  const [userA, userB] = await Promise.all([
    prisma.user.create({ data: { phone: `isolation-a-${suffix}@metrix.invalid`, fullName: "Isolation A" } }),
    prisma.user.create({ data: { phone: `isolation-b-${suffix}@metrix.invalid`, fullName: "Isolation B" } }),
  ]);
  const [organizationA, organizationB] = await Promise.all([
    prisma.organization.create({ data: { name: `Isolation A ${suffix}` } }),
    prisma.organization.create({ data: { name: `Isolation B ${suffix}` } }),
  ]);
  const [membershipA, membershipB] = await Promise.all([
    prisma.organizationMember.create({ data: { organizationId: organizationA.id, userId: userA.id, role: "OWNER" } }),
    prisma.organizationMember.create({ data: { organizationId: organizationB.id, userId: userB.id, role: "OWNER" } }),
  ]);
  const { session } = await createSession(userA.id, false);
  const [customerA, customerB, conversationB] = await Promise.all([
    prisma.customer.create({ data: { organizationId: organizationA.id, displayName: "ORG-A CUSTOMER", createdByUserId: userA.id } }),
    prisma.customer.create({ data: { organizationId: organizationB.id, displayName: "ORG-B CUSTOMER", createdByUserId: userB.id } }),
    prisma.conversation.create({ data: { organizationId: organizationB.id, createdBy: userB.id, title: "ORG-B PRIVATE CHAT" } }),
  ]);
  await prisma.message.create({ data: { conversationId: conversationB.id, senderType: "AI", content: "ORG-B PRIVATE MESSAGE" } });
  return {
    userA, userB, organizationA, organizationB, customerA, customerB, conversationB,
    actionScope: JSON.stringify([organizationA.id, userA.id]),
    authContextA: { user: userA, organization: organizationA, membership: membershipA, session },
    membershipB,
  };
}
