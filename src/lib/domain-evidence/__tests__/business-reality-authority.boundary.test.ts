import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("business reality constitutional boundaries", () => {
  it("keeps Event, Message and Conversation repositories outside management evidence", () => {
    const sources = [
      read("lib/executive-brain/executive-brain-context-builder.service.ts"),
      read("lib/executive-management-picture/executive-management-picture.builder.ts"),
      read("lib/executive-assessment/executive-assessment.adapter.ts"),
      read("lib/domain-evidence/domain-evidence.repository.ts"),
      read("lib/domain-evidence/domain-evidence.service.ts"),
    ].join("\n");

    expect(sources).not.toMatch(/prisma\.(?:event|message|conversation)\b/u);
    expect(sources).not.toMatch(/(?:Event|Message|Conversation)Repository/u);
    expect(sources).not.toMatch(/core\/(?:events|conversations)/u);
  });

  it("contains no Event keyword classifier or implicit ACTION_RESULT heuristic", () => {
    const source = [
      read("lib/executive-brain/executive-brain-context-builder.service.ts"),
      read("lib/executive-assessment/executive-assessment.adapter.ts"),
    ].join("\n");
    for (const forbidden of [
      "readEventSignals",
      "mapEventToSignal",
      "isFinanceEvent",
      "isSalesEvent",
      "isOperationsEvent",
      "hasAnyTerm",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).not.toMatch(/includes\(["']event["']\).*ACTION_RESULT/u);
  });

  it("keeps gateway on one canonical chain without operating-context gathering", () => {
    const gateway = read("lib/ai/gateway/ai-gateway.ts");
    const route = read("app/api/ai/chat/route.ts");
    expect(gateway).not.toContain("buildExecutiveOperatingContext");
    expect(route.match(/buildExecutiveManagementPictureV1\(/gu)).toHaveLength(1);
    expect(route.match(/buildExecutiveAssessmentFromManagementPicture\(/gu)).toHaveLength(1);
    expect(route.match(/resolveExecutiveDirective\(\{/gu)).toHaveLength(1);
    expect(route.match(/await sendAiMessage\(\{/gu)).toHaveLength(1);
    // Stage A owns two canonical generations in the same turn: the primary
    // response and its progressive enrichment. The fast opening uses the
    // same METRIX provider identity without adding a third gateway authority.
    expect(route.match(/streamWithAiGateway\(\{/gu)).toHaveLength(2);
  });

  it("keeps the legacy compatibility surface side-effect free", () => {
    const source = read(
      "lib/executive-operating-context/executive-operating-context-builder.service.ts",
    );
    expect(source).not.toMatch(/prisma\./u);
    expect(source).not.toContain("syncAiCollectionActions");
    expect(source).not.toContain("ensureExecutiveDecisionRecords");
    expect(source).not.toContain("maybeWriteSignalSnapshot");
  });
});
