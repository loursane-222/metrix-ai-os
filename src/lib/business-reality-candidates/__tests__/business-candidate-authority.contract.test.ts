import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../../..");
const schema = readFileSync(resolve(projectRoot, "prisma/schema.prisma"), "utf8");
const service = readFileSync(
  resolve(projectRoot, "src/lib/business-reality-candidates/business-candidate.service.ts"),
  "utf8",
);
const captureAdapter = readFileSync(
  resolve(projectRoot, "src/lib/business-reality-candidates/universal-capture-candidate.adapter.ts"),
  "utf8",
);

describe("durable Business Candidate authority", () => {
  it("models propositions, atomic changes, lifecycle audit and promotion receipt", () => {
    for (const model of [
      "model BusinessCandidate {",
      "model BusinessCandidateChange {",
      "model BusinessCandidateAudit {",
      "model BusinessCandidatePromotionReceipt {",
    ]) {
      expect(schema).toContain(model);
    }
    expect(schema).toContain("@@unique([candidateId, fieldPath])");
    expect(schema).toContain("PARTIALLY_APPROVED");
    expect(schema).toContain("approvedChangeIds");
    expect(schema).toContain("idempotencyKey");
  });

  it("is tenant-scoped, duplicate-safe and writes no canonical domain record itself", () => {
    expect(service).toContain("organizationId_idempotencyKey");
    expect(service).toContain("organizationId: input.organizationId");
    expect(service).toContain("BUSINESS_CANDIDATE_CHANGE_SCOPE_VIOLATION");
    expect(service).not.toMatch(/prisma\.(?:customer|productService|executiveAction)\.(?:create|update)/u);
  });

  it("requires approved atomic changes before injected Action Runtime execution", () => {
    expect(service).toContain("BUSINESS_CANDIDATE_HAS_NO_APPROVED_CHANGES");
    expect(service).toContain("await input.execute({");
    expect(service.indexOf("await input.execute({")).toBeLessThan(
      service.indexOf("businessCandidatePromotionReceipt.create"),
    );
  });

  it("blocks AI-generated capture and preserves multi-target proposition grouping", () => {
    expect(captureAdapter).toContain('source.category === "AI_GENERATED"');
    expect(captureAdapter).toContain("const groups = new Map");
    expect(captureAdapter).toContain("changes: candidates.map");
    expect(captureAdapter).toContain("requiresApproval: true");
  });
});
