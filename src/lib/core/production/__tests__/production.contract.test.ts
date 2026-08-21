import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createProductionWorkspaceDirective } from "@/lib/living-workspace";

describe("production phase 1 canonical contract", () => {
  it("keeps the model organization scoped and status tracked", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    expect(schema).toContain("model ProductionOrder {");
    expect(schema).toContain("organizationId    String");
    expect(schema).toContain("status            ProductionOrderStatus");
    expect(schema).toContain("model WorkCenter {");
    expect(schema).toContain("model Machine {");
  });

  it("projects list, create, and detail routes into canonical surfaces", () => {
    expect(createProductionWorkspaceDirective({ route: "/metrix/production", source: "system", correlationId: "c" })?.businessSurface).toBe("production-list");
    expect(createProductionWorkspaceDirective({ route: "/metrix/production/new", source: "system", correlationId: "c" })?.businessSurface).toBe("production-create");
    expect(createProductionWorkspaceDirective({ route: "/metrix/production/abc123", source: "system", correlationId: "c" })?.businessSurface).toBe("production-detail");
  });
});
