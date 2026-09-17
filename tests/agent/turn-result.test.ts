import { describe, expect, it } from "vitest";

import {
  createCanonicalCapabilityResult,
  createTurnResult
} from "../../src/lib/agent/turn-result";

describe("canonical turn result", () => {
  it("keeps a verified business mutation authoritative without coupling it to a renderer", () => {
    const capability = createCanonicalCapabilityResult({
      capability: "task_create",
      operation: "mutation",
      data: {
        task: { id: "task-1", title: "Yarın teklif ara", priority: "HIGH" }
      },
      verification: { status: "VERIFIED", verified: true }
    });

    const turn = createTurnResult({
      executiveText: "Yarın yüksek öncelikli görevi oluşturdum.",
      capabilityResults: [capability]
    });

    expect(turn.capabilityResults[0]).toEqual(capability);
    expect(turn.presentations).toEqual([]);
    expect(turn.artifacts).toEqual([]);
    expect(turn.approvals).toEqual([]);
  });
});
