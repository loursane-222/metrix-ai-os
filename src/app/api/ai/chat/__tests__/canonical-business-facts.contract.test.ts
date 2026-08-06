import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("chat canonical business facts contract", () => {
  it("threads exact table facts into the canonical operation evidence channel", () => {
    const source = readFileSync(new URL("../route.ts", import.meta.url), "utf8");
    expect(source).toContain("readCanonicalBusinessFactsForMessage");
    expect(source).toContain("serializeCanonicalBusinessFacts");
    expect(source.indexOf("canonicalBusinessFactsEvidence")).toBeLessThan(source.indexOf("canonicalOperationEvidenceLines"));
  });

  it("does not truncate the canonical customer navigation repository", () => {
    const source = readFileSync(new URL("../route.ts", import.meta.url), "utf8");
    const lookup = source.slice(source.indexOf("listCustomers: async"), source.indexOf("findLatestQuoteIdForCustomer"));
    expect(lookup).toContain("prisma.customer.findMany");
    expect(lookup).not.toContain("take:");
  });
});
