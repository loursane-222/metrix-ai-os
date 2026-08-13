import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public offer capability contract", () => {
  it("stores only a token hash and exposes an explicit safe projection", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const service = readFileSync("src/lib/core/offers/offer-public-link.service.ts", "utf8");
    expect(schema).toContain("publicTokenHash            String?      @unique");
    expect(service).toContain("publicTokenHash: hashSecret(token)");
    expect(service).not.toMatch(/publicTokenHash:\s*token\s*[,}]/u);
    const select = service.slice(service.indexOf("const publicOfferSelect"), service.indexOf("export async function ensurePublicOfferToken"));
    expect(select).not.toMatch(/\bnotes\s*:/u);
    expect(select).not.toMatch(/\bmetadata\s*:/u);
    expect(select).toContain("customerNote: true");
    expect(select).toContain("specialTerms: true");
    expect(select).toContain("customer: { select: { phone: true } }");
    expect(select).toContain("organization: { select: { name: true, companyProfile: { select: { logoRef: true } } } }");
    expect(select).toContain("status: true");
  });

  it("keeps customer decisions token-scoped and reuses canonical statuses and events", () => {
    const service = readFileSync("src/lib/core/offers/offer-public-actions.service.ts", "utf8");
    expect(service).toContain('const OPEN_STATUSES = ["SENT", "VIEWED", "NEGOTIATION"]');
    expect(service).toContain('status: "WON"');
    expect(service).toContain('eventType: "QUOTE_WON"');
    expect(service).toContain('status: "LOST"');
    expect(service).toContain('eventType: "QUOTE_LOST"');
    expect(service).toContain('eventType: "QUOTE_NEGOTIATION_STARTED"');
    expect(service).toContain("publicTokenHash: hashSecret(token)");
  });

  it("keeps the public page free of cookie auth guards", () => {
    const page = readFileSync("src/app/teklif/[token]/page.tsx", "utf8");
    const route = readFileSync("src/app/api/public/offers/[token]/route.ts", "utf8");
    expect(page).not.toContain("requireAuthContextFromCookies");
    expect(route).not.toContain("requireAuthContextFromCookies");
  });
});
