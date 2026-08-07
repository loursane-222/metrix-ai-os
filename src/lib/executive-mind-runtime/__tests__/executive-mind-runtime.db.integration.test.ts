import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const databaseIntegration = process.env.RUN_DATABASE_INTEGRATION === "1"
  ? describe
  : describe.skip;

databaseIntegration("Executive Mind Runtime persistence (real PostgreSQL)", () => {
  it("survives conversation A completion and conversation B creation", async () => {
    const { prisma } = await import("@/lib/core/shared/prisma");
    const {
      getExecutiveMindRuntimeState,
      putExecutiveMindRuntimeState,
    } = await import("..");
    const suffix = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Mind Runtime Acceptance ${suffix}` },
    });

    try {
      const conversationA = await prisma.conversation.create({
        data: { organizationId: organization.id, title: "Conversation A" },
      });
      const timestamp = new Date().toISOString();
      await putExecutiveMindRuntimeState({
        organizationId: organization.id,
        attentionFocus: "Nakit akışı kırılganlığı",
        workingMemory: [{
          key: "cash-flow-window",
          value: "Önümüzdeki 14 gün",
          loadedAt: timestamp,
        }],
        hypotheses: [{
          id: "hypothesis:collection-delay",
          summary: "Tahsilat gecikmesi likiditeyi sıkıştırabilir.",
          validationLevel: "SUPPORTED",
          observedAt: timestamp,
          updatedAt: timestamp,
        }],
        beliefs: [{
          id: "belief:protect-liquidity",
          summary: "Likidite korunmalı.",
          validationLevel: "VERIFIED",
          observedAt: timestamp,
          updatedAt: timestamp,
        }],
      });

      await prisma.conversation.update({
        where: { id: conversationA.id, organizationId: organization.id },
        data: { status: "COMPLETED" },
      });
      const conversationB = await prisma.conversation.create({
        data: { organizationId: organization.id, title: "Conversation B" },
      });

      expect(conversationB.id).not.toBe(conversationA.id);
      await expect(getExecutiveMindRuntimeState(organization.id)).resolves.toMatchObject({
        organizationId: organization.id,
        attentionFocus: "Nakit akışı kırılganlığı",
        workingMemory: [{ key: "cash-flow-window" }],
        hypotheses: [{ id: "hypothesis:collection-delay", validationLevel: "SUPPORTED" }],
        beliefs: [{ id: "belief:protect-liquidity", validationLevel: "VERIFIED" }],
      });
    } finally {
      await prisma.organization.delete({ where: { id: organization.id } });
      await prisma.$disconnect();
    }
  });
});
