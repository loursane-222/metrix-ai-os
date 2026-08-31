import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectExternalEvidence } from "../external-evidence-orchestrator.service";
import type {
  ExternalEvidenceRequest,
  ExternalEvidenceResult,
  ExternalEvidenceTool,
} from "../external-evidence.types";

const SECRET_MESSAGE = "raw upstream failure: api key sk-leak-should-never-surface";

function makeTool(
  capability: ExternalEvidenceTool["capability"],
  behavior: "success" | "failed" | "throw",
): ExternalEvidenceTool {
  return {
    capability,
    async fetch(query: string): Promise<ExternalEvidenceResult> {
      if (behavior === "throw") throw new Error(SECRET_MESSAGE);
      const retrievedAt = "2026-09-01T00:00:00.000Z";
      if (behavior === "failed") {
        return { status: "FAILED", capability, query, retrievedAt, failureReason: "no_results" };
      }
      return {
        status: "SUCCESS",
        capability,
        query,
        retrievedAt,
        observedAt: "2026-08-31T00:00:00.000Z",
        provenance: [{ providerId: "test_provider", sourceName: "Test Source", sourceUrl: "https://example.com" }],
        payload: { value: 42 },
      };
    },
  };
}

describe("collectExternalEvidence — canonical evidence ownership", () => {
  it("has a single canonical owner: an unregistered capability never silently produces evidence", async () => {
    const requests: ExternalEvidenceRequest[] = [{ capability: "web_research", query: "test" }];
    const [result] = await collectExternalEvidence(requests, []);
    expect(result).toEqual({
      status: "FAILED",
      capability: "web_research",
      query: "test",
      retrievedAt: expect.any(String),
      failureReason: "not_configured",
    });
  });

  it("returns only the structured evidence shape — no field can carry direct user-facing narration", async () => {
    const tool = makeTool("web_research", "success");
    const [result] = await collectExternalEvidence([{ capability: "web_research", query: "abc" }], [tool]);
    expect(result.status).toBe("SUCCESS");
    // Exact key set — nothing extra (like "message"/"text"/"narration")
    // could have been smuggled in by a tool implementation.
    expect(Object.keys(result).sort()).toEqual(
      ["capability", "observedAt", "payload", "provenance", "query", "retrievedAt", "status"].sort(),
    );
  });

  it("preserves provenance and freshness metadata through the handoff unchanged", async () => {
    const tool = makeTool("web_research", "success");
    const [result] = await collectExternalEvidence([{ capability: "web_research", query: "abc" }], [tool]);
    if (result.status !== "SUCCESS") throw new Error("expected SUCCESS");
    expect(result.provenance).toEqual([
      { providerId: "test_provider", sourceName: "Test Source", sourceUrl: "https://example.com" },
    ]);
    expect(result.observedAt).toBe("2026-08-31T00:00:00.000Z");
    expect(result.retrievedAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("passes through a tool's own structured failure verbatim", async () => {
    const tool = makeTool("web_research", "failed");
    const [result] = await collectExternalEvidence([{ capability: "web_research", query: "abc" }], [tool]);
    expect(result).toEqual({
      status: "FAILED",
      capability: "web_research",
      query: "abc",
      retrievedAt: "2026-09-01T00:00:00.000Z",
      failureReason: "no_results",
    });
  });

  it("normalizes a tool that throws instead of returning FAILED — the raw exception text never reaches the result", async () => {
    const tool = makeTool("web_research", "throw");
    const [result] = await collectExternalEvidence([{ capability: "web_research", query: "abc" }], [tool]);
    expect(result.status).toBe("FAILED");
    if (result.status !== "FAILED") throw new Error("expected FAILED");
    expect(result.failureReason).toBe("provider_error");
    expect(JSON.stringify(result)).not.toContain(SECRET_MESSAGE);
  });

  it("fans out multiple evidence requests across multiple tools without a new orchestrator, preserving request order", async () => {
    const requests: ExternalEvidenceRequest[] = [
      { capability: "web_research", query: "first" },
      { capability: "web_research", query: "second" },
    ];
    const tool = makeTool("web_research", "success");
    const results = await collectExternalEvidence(requests, [tool]);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.query)).toEqual(["first", "second"]);
  });
});

describe("collectExternalEvidence — no business-state mutation authority", () => {
  it("the orchestrator has no persistence/mutation dependency — evidence collection cannot write canonical business state", () => {
    const source = readFileSync(
      new URL("../external-evidence-orchestrator.service.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/prisma|\.create\(|\.update\(|\.delete\(|tx\./);
  });
});
