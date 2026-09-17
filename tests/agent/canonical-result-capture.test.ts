import { describe, expect, it } from "vitest";

import { canonicalResultForToolCall } from "../../src/lib/agent/tools/metrix-business-tool-runtime";

describe("canonical capability result capture", () => {
  it("marks deterministic action results as mutations and preserves verification", () => {
    expect(
      canonicalResultForToolCall("task_create", {
        action: "task.create",
        status: "VERIFIED",
        verified: true,
        task: { id: "task-1" }
      })
    ).toMatchObject({
      capability: "task_create",
      operation: "mutation",
      verification: { status: "VERIFIED", verified: true }
    });
  });
});
