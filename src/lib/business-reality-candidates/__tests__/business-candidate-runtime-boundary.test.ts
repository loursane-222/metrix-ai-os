import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Business Candidate production runtime boundary", () => {
  it("uses one shared semantic extractor for text and voice chat turns", () => {
    const route = read("src/app/api/ai/chat/route.ts");
    expect(route.match(/extractAndPersistBusinessCandidates\(\{/g)).toHaveLength(1);
    expect(route).toContain("BusinessCandidateSourceChannel.VOICE");
    expect(route).toContain("BusinessCandidateSourceChannel.TEXT");
  });

  it("decision and retry APIs call the real Action Runtime executor", () => {
    const decision = read(
      "src/app/api/business-candidates/[candidateId]/decision/route.ts",
    );
    const retry = read(
      "src/app/api/business-candidates/[candidateId]/promote/route.ts",
    );
    for (const source of [decision, retry]) {
      expect(source).toContain("createBusinessCandidateActionRuntimeExecutor(auth)");
      expect(source).toContain("promoteBusinessCandidate({");
      expect(source).toContain("auth.organization.id");
    }
  });

  it("registers canonical customer, product and executive-action executors once", () => {
    const composition = read(
      "src/lib/action-runtime/composition/production-execution-runtime.ts",
    );
    expect(composition.match(/registerCustomerActions\(/g)).toHaveLength(1);
    expect(composition.match(/registerProductActions\(/g)).toHaveLength(1);
    expect(composition.match(/registerExecutiveActionCreate\(/g)).toHaveLength(1);
  });

  it("keeps the AI gateway free of the legacy operating-context authority", () => {
    const gateway = read("src/lib/ai/gateway/ai-gateway.ts");
    expect(gateway).not.toContain("buildExecutiveOperatingContext");
    expect(gateway).not.toContain("@/lib/executive-operating-context");
  });

  it("projects compatibility value from Domain Evidence without Prisma or writes", () => {
    const compatibility = read(
      "src/lib/executive-operating-context/executive-operating-context-builder.service.ts",
    );
    expect(compatibility).toContain("canonicalContext.domainEvidence");
    expect(compatibility).toContain("projectQuoteContext");
    expect(compatibility).toContain("projectPaymentContext");
    expect(compatibility).toContain("projectDecisionContext");
    expect(compatibility).not.toContain("prisma.");
    expect(compatibility).not.toMatch(/syncAiCollectionActions|ensureExecutiveDecisionRecords|maybeWriteSignalSnapshot/);
  });
});
