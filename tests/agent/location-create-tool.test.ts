import { afterAll, describe, expect, it } from "vitest";
import { RunContext } from "@openai/agents";

import { db } from "../../src/lib/db";
import { createLocationCreateTool } from "../../src/lib/agent/tools/location-create-tool";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const organizationId = `tool-lc-org-${suffix}`;
const userId = `tool-lc-user-${suffix}`;

describe("native location_create executive tool", () => {
  it("keeps identity and idempotency in trusted server context, hides trusted fields from the model contract", async () => {
    await db.organization.create({
      data: { id: organizationId, name: "Location Create Tool Org" }
    });
    await db.user.create({
      data: { id: userId, email: `${userId}@example.test`, name: "Tool User" }
    });
    await db.organizationMember.create({
      data: { organizationId, userId, role: "MEMBER" }
    });

    const tool = createLocationCreateTool();

    expect(tool.name).toBe("location_create");
    const parameters = JSON.stringify(tool.parameters);
    expect(parameters).not.toContain("organizationId");
    expect(parameters).not.toContain("actorUserId");
    expect(parameters).not.toContain("idempotencyKey");

    const context = new RunContext({
      actorUserId: userId,
      organizationId,
      turnId: `turn-${suffix}`
    });

    const raw = await tool.invoke(
      context,
      JSON.stringify({ name: "Merkez Depo", kind: "WAREHOUSE" })
    );

    const result = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
      status: string;
      verified: boolean;
      location: { name: string; kind: string };
    };

    expect(result.status).toBe("VERIFIED");
    expect(result.verified).toBe(true);
    expect(result.location.name).toBe("Merkez Depo");
    expect(result.location.kind).toBe("WAREHOUSE");
  });
});

afterAll(async () => {
  await db.location.deleteMany({ where: { organizationId } });
  await db.actionExecution.deleteMany({ where: { organizationId } });
  await db.organizationMember.deleteMany({ where: { organizationId } });
  await db.organization.deleteMany({ where: { id: organizationId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});
