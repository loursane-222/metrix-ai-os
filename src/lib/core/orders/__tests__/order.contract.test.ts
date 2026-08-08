import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createOrderWorkspaceDirective } from "@/lib/living-workspace";

describe("order phase 1 canonical contract", () => {
  it("keeps Order model organization-scoped with lifecycle enum", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    expect(schema).toContain("model Order {");
    expect(schema).toContain("organizationId        String");
    expect(schema).toContain("enum OrderStatus {");
    expect(schema).toContain("DRAFT");
    expect(schema).toContain("COMPLETED");
    expect(schema).toContain("CANCELLED");
  });

  it("keeps OrderStatusHistory model for auditable transitions", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    expect(schema).toContain("model OrderStatusHistory {");
    expect(schema).toContain("fromStatus     OrderStatus?");
    expect(schema).toContain("toStatus       OrderStatus");
    expect(schema).toContain("reason         String?");
    expect(schema).toContain("performedById  String?");
  });

  it("sourceQuoteId is nullable — order links to quote without copying it", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    expect(schema).toContain("sourceQuoteId         String?");
  });

  it("projects list and create routes into canonical workspace surfaces", () => {
    expect(createOrderWorkspaceDirective({ route: "/metrix/orders", source: "system", correlationId: "c" })?.businessSurface).toBe("order-list");
    expect(createOrderWorkspaceDirective({ route: "/metrix/orders/new", source: "system", correlationId: "c" })?.businessSurface).toBe("order-create");
  });

  it("returns null for unrecognised order routes", () => {
    expect(createOrderWorkspaceDirective({ route: "/metrix/customers", source: "system", correlationId: "c" })).toBeNull();
  });
});
