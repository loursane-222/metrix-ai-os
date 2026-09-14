import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/agent/tools/product-service-lookup-tool.ts"
);

const implementationExists =
  existsSync(implementationPath);

describe("native product_service_lookup executive tool", () => {
  it("requires the native tool implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it("uses trusted context and returns grounded product/service reality", async () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const { RunContext } =
      await import("@openai/agents");

    const { db } =
      await import("../../src/lib/db");

    const {
      createProductServiceLookupTool
    } = await import(
      "../../src/lib/agent/tools/product-service-lookup-tool"
    );

    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organizationId =
      `tool-psl-org-${suffix}`;

    const userId =
      `tool-psl-user-${suffix}`;

    const turnId =
      `tool-psl-turn-${suffix}`;

    await db.organization.create({
      data: {
        id: organizationId,
        name: "Native PSL Tool Tenant"
      }
    });

    await db.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        name: "Native PSL Tool User"
      }
    });

    await db.organizationMember.create({
      data: { organizationId, userId, role: "MEMBER" }
    });

    try {
      const tool = createProductServiceLookupTool();

      expect(tool.name).toBe(
        "product_service_lookup"
      );

      const parameters =
        JSON.stringify(tool.parameters);

      expect(parameters).toContain("query");
      expect(parameters).toContain("type");

      expect(parameters).not.toContain(
        "actorUserId"
      );
      expect(parameters).not.toContain(
        "organizationId"
      );
      expect(parameters).not.toContain(
        "idempotencyScope"
      );
      expect(parameters).not.toContain(
        "requestHash"
      );

      await db.productService.create({
        data: {
          organizationId,
          name: "Danışmanlık Hizmeti",
          type: "SERVICE",
          priceCents: BigInt(50_000),
          status: "ACTIVE"
        }
      });

      const context = new RunContext({
        actorUserId: userId,
        organizationId,
        turnId
      });

      const raw = await tool.invoke(
        context,
        JSON.stringify({ query: "Danış" })
      );

      const result = (
        typeof raw === "string"
          ? JSON.parse(raw)
          : raw
      ) as {
        source: string;
        count: number;
        products: Array<{
          id: string;
          name: string;
        }>;
      };

      expect(result.source).toBe(
        "COMPANY_REALITY"
      );
      expect(result.count).toBe(1);
      expect(result.products[0]?.name).toBe(
        "Danışmanlık Hizmeti"
      );
    } finally {
      await db.productService.deleteMany({
        where: { organizationId }
      });

      await db.organizationMember.deleteMany({
        where: { organizationId }
      });

      await db.user.delete({
        where: { id: userId }
      });

      await db.organization.delete({
        where: { id: organizationId }
      });
    }
  });
});

afterAll(async () => {
  if (!implementationExists) return;

  const { db } =
    await import("../../src/lib/db");

  await db.$disconnect();
});
