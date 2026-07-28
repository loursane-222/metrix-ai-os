import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
describe("Company workspace projection contract", () => {
  it("assembles the management surface from the canonical Company Model V2 projection", () => {
    const source = readFileSync(join(process.cwd(), "src/app/api/company/route.ts"), "utf8");
    expect(source).toContain("buildCanonicalCompanyModelV2(auth.organization.id)");
    expect(source).toContain("return ok({ ...overview, companyModel })");
  });
});
