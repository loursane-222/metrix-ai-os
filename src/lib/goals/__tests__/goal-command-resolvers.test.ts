import { describe, expect, it } from "vitest";
import { resolveGoalCreateCommand } from "../goal-create-command-resolver";
import { resolveGoalEditCommand } from "../goal-edit-command-resolver";

describe("goal command resolvers", () => {
  it("resolves create fields and rejects invalid enum values", async () => {
    await expect(resolveGoalCreateCommand({ utterance: "dönemi çeyreklik yap", activeTab: "actions", generateText: async () => '{"result":"executable","action":"set_field","field":"period","value":"QUARTERLY"}' })).resolves.toMatchObject({ kind: "resolved", resolution: { command: { field: "period", value: "QUARTERLY" } } });
    await expect(resolveGoalCreateCommand({ utterance: "dönemi değiştir", activeTab: "actions", generateText: async () => '{"result":"executable","action":"set_field","field":"period","value":"WEEKLY"}' })).resolves.toEqual({ kind: "invalid_output" });
  });

  it("keeps read-only goal fields outside edit commands", async () => {
    await expect(resolveGoalEditCommand({ utterance: "gerçekleşeni değiştir", activeTab: "actions", generateText: async () => '{"result":"executable","action":"set_field","field":"actualValue","value":"10"}' })).resolves.toEqual({ kind: "invalid_output" });
    await expect(resolveGoalEditCommand({ utterance: "geliri değiştir", activeTab: "actions", generateText: async () => '{"result":"executable","action":"set_field","field":"revenue","value":"200000"}' })).resolves.toMatchObject({ kind: "resolved", resolution: { command: { field: "revenue", value: "200000" } } });
  });
});
