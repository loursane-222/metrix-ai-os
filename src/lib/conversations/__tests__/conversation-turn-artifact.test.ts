import { describe, expect, it } from "vitest";
import { buildConversationTurnArtifacts, readConversationTurnArtifacts } from "../conversation-turn-artifact";

describe("conversation turn artifacts", () => {
  it("stores canonical IDs, order, source message and expiry", () => {
    const artifacts = buildConversationTurnArtifacts({
      facts: [{ entity: "customers", model: "Customer", count: 2, records: [{ id: "c1", name: "Atlas", legalName: null, status: "ACTIVE" }, { id: "c2", name: "Beta", legalName: null, status: "ACTIVE" }] }],
      sourceMessageId: "message-1",
      organizationId: "org-1",
      now: new Date("2026-08-06T12:00:00.000Z"),
    });
    expect(artifacts[0]).toMatchObject({ entity: "customers", recordIds: ["c1", "c2"], displayOrder: ["Atlas", "Beta"], sourceMessageId: "message-1", organizationId: "org-1" });
    expect(readConversationTurnArtifacts({ conversationTurnArtifacts: artifacts }, new Date("2026-08-06T12:01:00.000Z"))).toHaveLength(1);
    expect(readConversationTurnArtifacts({ conversationTurnArtifacts: artifacts }, new Date("2026-08-06T12:16:00.000Z"))).toHaveLength(0);
  });
});

