import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public customer statement capability contract", () => {
  it("stores only a token hash on Customer, never the plaintext token", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const service = readFileSync("src/lib/accounting/customer-statement-public-link.service.ts", "utf8");
    expect(schema).toContain("publicStatementTokenHash      String?   @unique");
    expect(service).toContain("publicStatementTokenHash: hashSecret(token)");
    expect(service).not.toMatch(/publicStatementTokenHash:\s*token\s*[,}]/u);
  });

  it("recomputes the statement live on every visit rather than persisting a snapshot", () => {
    const service = readFileSync("src/lib/accounting/customer-statement-public-link.service.ts", "utf8");
    expect(service).toContain("getCustomerStatement(customer.organizationId, customer.id)");
  });

  it("keeps the public page and route free of cookie auth guards — token-only access, by design", () => {
    const page = readFileSync("src/app/mutabakat/[token]/page.tsx", "utf8");
    const service = readFileSync("src/lib/accounting/customer-statement-public-link.service.ts", "utf8");
    expect(page).not.toContain("requireAuthContextFromCookies");
    expect(service).not.toContain("requireAuthContextFromCookies");
  });

  it("requires auth to mint a new token — only the org's own API can issue a statement link", () => {
    const route = readFileSync("src/app/api/customers/[customerId]/statement-public-link/route.ts", "utf8");
    expect(route).toContain("requireAuthContextFromCookies");
  });
});
