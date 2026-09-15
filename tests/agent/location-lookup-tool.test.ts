import { afterAll, describe, expect, it } from "vitest";
import { RunContext } from "@openai/agents";

import { db } from "../../src/lib/db";
import { createLocationLookupTool } from "../../src/lib/agent/tools/location-lookup-tool";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const organizationId = `tool-ll-org-${suffix}`;
const userId = `tool-ll-user-${suffix}`;

describe("native location_lookup executive tool", () => {
  it("uses trusted context and returns grounded location reality", async () => {
    await db.organization.create({
      data: { id: organizationId, name: "Location Lookup Tool Org" }
    });
    await db.user.create({
      data: { id: userId, email: `${userId}@example.test`, name: "Tool User" }
    });
    await db.organizationMember.create({
      data: { organizationId, userId, role: "MEMBER" }
    });
    await db.location.create({
      data: { organizationId, name: "Kadıköy Şube", kind: "BRANCH" }
    });

    const tool = createLocationLookupTool();
    expect(tool.name).toBe("location_lookup");

    const context = new RunContext({
      actorUserId: userId,
      organizationId,
      turnId: `turn-${suffix}`
    });

    const raw = await tool.invoke(
      context,
      JSON.stringify({ query: "kadıköy" })
    );

    const result = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
      source: string;
      count: number;
      locations: Array<{ name: string }>;
    };

    expect(result.source).toBe("COMPANY_REALITY");
    expect(result.count).toBe(1);
    expect(result.locations[0]?.name).toBe("Kadıköy Şube");
  });
});

afterAll(async () => {
  await db.location.deleteMany({ where: { organizationId } });
  await db.organizationMember.deleteMany({ where: { organizationId } });
  await db.organization.deleteMany({ where: { id: organizationId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});
