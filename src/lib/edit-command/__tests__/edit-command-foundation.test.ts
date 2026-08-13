import { describe, expect, it } from "vitest";

import type { ModuleFieldDefinition } from "@/lib/field-authority/field-authority";
import { createDomainFieldRegistry, writableDomainFieldKeys } from "../domain-field-registry";
import { resolveEditCommand } from "../edit-command-resolver";
import { createEditSurfaceCommandChannel } from "../edit-surface-command-channel";

function field(key: string, writable = true): ModuleFieldDefinition {
  return {
    fieldId: `demo.${key}`, module: "demo", entityType: "record", key, label: key, description: key,
    valueType: "string", storageKind: "scalar", requiredOnCreate: false, requiredOnUpdate: false,
    readable: true, writable, clearable: true, searchable: false, filterable: false, sortable: false,
    reportable: false, sourceOfTruth: "entity", sensitivity: "INTERNAL", riskLevel: "LOW",
    approvalPolicy: "NONE", permissionRead: "demo.read", permissionWrite: "demo.write",
    normalization: "trim", uiSection: "main", uiOrder: 0, custom: false, state: "ACTIVE", aliases: [key],
  };
}

describe("universal edit-command foundation", () => {
  it("creates a validated registry and exposes only writable keys", () => {
    const registry = createDomainFieldRegistry({ domain: "demo", entityType: "record", fields: [field("name"), field("code", false)] });
    expect(writableDomainFieldKeys(registry)).toEqual(["name"]);
    expect(() => createDomainFieldRegistry({ domain: "other", entityType: "record", fields: [field("name")] })).toThrow("does not belong");
  });

  it("centralizes fenced JSON parsing while keeping prompt and schema domain-parametric", async () => {
    const registry = createDomainFieldRegistry({ domain: "demo", entityType: "record", fields: [field("name")] });
    let promptInput: unknown;
    const outcome = await resolveEditCommand({
      domain: "demo", fieldRegistry: registry, utterance: "Adı Atlas yap", activeTab: "main",
      buildSystemPrompt: (input) => { promptInput = input; return "demo prompt"; },
      generateText: async ({ systemPrompt, userMessage }) => {
        expect({ systemPrompt, userMessage }).toEqual({ systemPrompt: "demo prompt", userMessage: "Adı Atlas yap" });
        return '```json\n{"result":"executable","value":"Atlas"}\n```';
      },
      validateResolution: (raw) => raw && typeof raw === "object" && (raw as { result?: unknown }).result === "executable"
        ? { value: (raw as { value: string }).value } : null,
    });
    expect(promptInput).toEqual({ domain: "demo", activeTab: "main", fieldRegistry: registry });
    expect(outcome).toEqual({ kind: "resolved", resolution: { value: "Atlas" } });
  });

  it("rejects a resolver/registry domain mismatch", async () => {
    const registry = createDomainFieldRegistry({ domain: "demo", entityType: "record", fields: [field("name")] });
    await expect(resolveEditCommand({
      domain: "other", fieldRegistry: registry, utterance: "x", activeTab: "main",
      buildSystemPrompt: () => "", generateText: async () => "{}", validateResolution: () => null,
    })).rejects.toThrow("domain mismatch");
  });

  it("provides isolated registration, live descriptors, stale-token protection and failure mapping", async () => {
    type Runtime = { state: { activeTab: string }; getState(): { activeTab: string } };
    const channel = createEditSurfaceCommandChannel<string, string, Runtime>({
      domain: "demo", tokenPrefix: "demo", applyCommand: (command, runtime) => {
        if (command === "fail") throw new Error("boom");
        return `${runtime.getState().activeTab}:${command}`;
      }, staleResult: () => "stale", failureResult: (message) => `failure:${message}`,
    });
    const runtime: Runtime = { state: { activeTab: "first" }, getState() { return this.state; } };
    const firstToken = channel.register({ entityId: "one", runtime });
    runtime.state.activeTab = "second";
    expect(channel.getDescriptor()).toEqual({ token: firstToken, entityId: "one", activeTab: "second" });
    const secondToken = channel.register({ entityId: "two", runtime });
    expect(await channel.dispatch(firstToken, "set")).toBe("stale");
    expect(await channel.dispatch(secondToken, "set")).toBe("second:set");
    expect(await channel.dispatch(secondToken, "fail")).toBe("failure:boom");
  });
});
