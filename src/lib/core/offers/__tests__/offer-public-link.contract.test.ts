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
  });

  it("keeps the public page free of cookie auth guards", () => {
    const page = readFileSync("src/app/teklif/[token]/page.tsx", "utf8");
    const route = readFileSync("src/app/api/public/offers/[token]/route.ts", "utf8");
    expect(page).not.toContain("requireAuthContextFromCookies");
    expect(route).not.toContain("requireAuthContextFromCookies");
  });
});
