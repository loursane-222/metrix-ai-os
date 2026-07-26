import { readFileSync } from "node:fs";
import type {
  ExecutiveDecisionOutcome,
  ExecutiveDecisionRecord,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  projectExecutiveOutcomeToMemory,
  projectExecutiveOutcomeV1,
} from "..";

const record = (
  status: ExecutiveDecisionRecord["status"] = "CLOSED",
): ExecutiveDecisionRecord => ({
  id: "decision-1",
  organizationId: "org-1",
  conversationId: "conversation-1",
  sourceMessageId: "message-1",
  aiMessageId: null,
  sourceType: "EXECUTIVE_BRAIN",
  sourceKey: "conversation:test",
  sourceSnapshotId: null,
  title: "Tahsilat planını tamamla",
  rationale: "Nakit riskini azalt.",
  actionHint: null,
  category: "FINANCE",
  priority: "HIGH",
  status,
  confidenceScore: 0.9,
  evidenceJson: null,
  sourcePayload: {},
  decisionDate: "2026-07-26",
  committedAt: new Date("2026-07-26T08:00:00.000Z"),
  followUpDueAt: new Date("2026-07-27T08:00:00.000Z"),
  closedAt: status === "CLOSED" ? new Date("2026-07-26T10:00:00.000Z") : null,
  createdAt: new Date("2026-07-26T07:00:00.000Z"),
  updatedAt: new Date("2026-07-26T10:00:00.000Z"),
});

const persistedOutcome = (
  outcome: ExecutiveDecisionOutcome["outcome"],
): ExecutiveDecisionOutcome => ({
  id: `outcome-${outcome.toLowerCase()}`,
  organizationId: "org-1",
  decisionRecordId: "decision-1",
  conversationId: "conversation-1",
  sourceMessageId: "message-2",
  outcome,
  summary: null,
  evidenceJson: null,
  occurredAt: new Date("2026-07-26T10:00:00.000Z"),
  createdAt: new Date("2026-07-26T10:00:00.000Z"),
});

describe("ExecutiveOutcomeV1 contract and mapping", () => {
  it.each([
    ["SUCCESS", "ACHIEVED", false],
    ["FAILURE", "NOT_ACHIEVED", true],
    ["ABANDONED", "ABANDONED", true],
  ] as const)("maps persisted %s to %s", (source, status, requiresReagenda) => {
    const outcome = projectExecutiveOutcomeV1({
      decisionRecord: record(),
      decisionOutcome: persistedOutcome(source),
      generatedAt: "2026-07-26T10:01:00.000Z",
    });
    expect(outcome).toMatchObject({
      schemaVersion: "1.0",
      status,
      sourceOutcome: source,
      managementImpact: { requiresReagenda },
    });
    expect(Object.isFrozen(outcome)).toBe(true);
    expect(Object.isFrozen(outcome.objective)).toBe(true);
    expect(Object.isFrozen(outcome.evidence)).toBe(true);
  });

  it("maps COMMITTED without persisted outcome to PENDING", () => {
    const outcome = projectExecutiveOutcomeV1({
      decisionRecord: record("COMMITTED"),
      decisionOutcome: null,
    });
    expect(outcome).toMatchObject({
      outcomeId: "pending:decision-1",
      status: "PENDING",
      sourceOutcome: "UNAVAILABLE",
      confidence: "MEDIUM",
      managementImpact: { requiresFollowUp: true, requiresReagenda: false },
    });
    expect(projectExecutiveOutcomeToMemory(outcome)).toBeNull();
  });

  it("maps CLOSED without persisted outcome to UNKNOWN consistency state", () => {
    expect(projectExecutiveOutcomeV1({
      decisionRecord: record("CLOSED"),
      decisionOutcome: null,
    })).toMatchObject({
      status: "UNKNOWN",
      sourceOutcome: "UNAVAILABLE",
      confidence: "LOW",
    });
  });

  it("rejects organization and decision reference mismatches", () => {
    expect(() => projectExecutiveOutcomeV1({
      decisionRecord: record(),
      decisionOutcome: {
        ...persistedOutcome("SUCCESS"),
        organizationId: "org-other",
      },
    })).toThrow("references do not match");
  });

  it("projects only a safe memory summary after persistence", () => {
    const outcome = projectExecutiveOutcomeV1({
      decisionRecord: record(),
      decisionOutcome: persistedOutcome("SUCCESS"),
    });
    const memory = projectExecutiveOutcomeToMemory(outcome);
    expect(memory).toEqual({
      key: "karar_sonucu",
      value: "Tahsilat planını tamamla: başarılı",
      confidence: 0.9,
    });
    expect(JSON.stringify(memory)).not.toContain("evidence");
    expect(JSON.stringify(memory)).not.toContain("message-2");
  });
});

describe("Executive outcome ownership boundaries", () => {
  const contracts = readFileSync(
    new URL("../executive-outcome.contracts.ts", import.meta.url),
    "utf8",
  );
  const adapter = readFileSync(
    new URL("../executive-outcome.adapter.ts", import.meta.url),
    "utf8",
  );
  const route = readFileSync(
    new URL("../../../app/api/ai/chat/route.ts", import.meta.url),
    "utf8",
  );
  const action = readFileSync(
    new URL("../../core/executive-actions/executive-action-outcome-capture.service.ts", import.meta.url),
    "utf8",
  );
  const gateway = readFileSync(
    new URL("../../ai/gateway/ai-gateway.ts", import.meta.url),
    "utf8",
  );
  const guidance = readFileSync(
    new URL("../../ai/living-executive-presence/executive-conversation-guidance.ts", import.meta.url),
    "utf8",
  );

  it("contains no persistence, response, intent, tool, or task authority", () => {
    for (const forbidden of [
      "prisma.", "sendAiMessage", "primaryIntent", "toolName", "taskStatus",
    ]) {
      expect(`${contracts}\n${adapter}`).not.toContain(forbidden);
    }
  });

  it("keeps response completion and conversation state outside projection authority", () => {
    expect(adapter).not.toContain("commitmentOutcome");
    expect(adapter).not.toContain("done_event_sent");
    expect(route.lastIndexOf("registerAndResolveExecutiveDecisionOutcome")).toBeGreaterThan(
      route.indexOf("done_event_sent"),
    );
  });

  it("keeps ExecutiveAction separate and Gateway/Guidance outcome-blind", () => {
    expect(action).not.toContain("ExecutiveOutcomeV1");
    expect(gateway).not.toContain("ExecutiveOutcomeV1");
    expect(guidance).not.toContain("ExecutiveOutcomeV1");
    expect(route.match(/await sendAiMessage\(\{/g)).toHaveLength(1);
    expect(route).not.toContain('channel === "voice" ? registerAndResolveExecutiveDecisionOutcome');
  });
});
