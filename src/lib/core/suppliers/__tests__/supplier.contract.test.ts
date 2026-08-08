import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSupplierWorkspaceDirective } from "@/lib/living-workspace";
describe("supplier phase 1 canonical contract", () => {
  it("keeps the model organization scoped and archive based", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    expect(schema).toContain("model Supplier {"); expect(schema).toContain("organizationId  String"); expect(schema).toContain("status          SupplierStatus");
  });
  it("projects list and create routes into canonical surfaces", () => {
    expect(createSupplierWorkspaceDirective({ route: "/metrix/suppliers", source: "system", correlationId: "c" })?.businessSurface).toBe("supplier-list");
    expect(createSupplierWorkspaceDirective({ route: "/metrix/suppliers/new", source: "system", correlationId: "c" })?.businessSurface).toBe("supplier-create");
  });
});
