import { describe, expect, it } from "vitest";

import { resolveCustomerEditCommand } from "../customer-edit-command-resolver";

function generatorReturning(text: string) {
  return async () => text;
}

describe("resolveCustomerEditCommand", () => {
  it("resolves an executable set_field command from strict JSON output", async () => {
    const outcome = await resolveCustomerEditCommand({
      utterance: "Telefonu 0532 111 22 33 yap.",
      activeTab: "identity",
      generateText: generatorReturning(
        JSON.stringify({ result: "executable", action: "set_field", field: "phone", value: "0532 111 22 33" }),
      ),
    });

    expect(outcome).toEqual({
      kind: "resolved",
      resolution: {
        kind: "executable",
        command: { type: "set_field", field: { kind: "top", field: "phone" }, value: "0532 111 22 33" },
      },
    });
  });

  it("resolves unsupported", async () => {
    const outcome = await resolveCustomerEditCommand({
      utterance: "Bugün hava nasıl?",
      activeTab: "identity",
      generateText: generatorReturning(JSON.stringify({ result: "unsupported" })),
    });
    expect(outcome).toEqual({ kind: "resolved", resolution: { kind: "unsupported" } });
  });

  it("resolves clarification_required", async () => {
    const outcome = await resolveCustomerEditCommand({
      utterance: "Adresi güncelle.",
      activeTab: "address",
      generateText: generatorReturning(
        JSON.stringify({ result: "clarification_required", message: "Hangi adresi ve hangi alani?" }),
      ),
    });
    expect(outcome).toEqual({
      kind: "resolved",
      resolution: { kind: "clarification_required", message: "Hangi adresi ve hangi alani?" },
    });
  });

  it("strips a markdown code fence around the JSON before parsing", async () => {
    const outcome = await resolveCustomerEditCommand({
      utterance: "E-faturayı aç.",
      activeTab: "financial",
      generateText: generatorReturning(
        "```json\n" + JSON.stringify({ result: "executable", action: "set_field", field: "eInvoiceEnabled", value: true }) + "\n```",
      ),
    });
    expect(outcome.kind).toBe("resolved");
  });

  it("returns invalid_output for non-JSON model output", async () => {
    const outcome = await resolveCustomerEditCommand({
      utterance: "Telefonu değiştir.",
      activeTab: "identity",
      generateText: generatorReturning("Elbette, telefon numarasını değiştiriyorum!"),
    });
    expect(outcome).toEqual({ kind: "invalid_output" });
  });

  it("returns invalid_output for well-formed JSON that fails schema validation (unknown field)", async () => {
    const outcome = await resolveCustomerEditCommand({
      utterance: "Organizasyon kimliğini değiştir.",
      activeTab: "identity",
      generateText: generatorReturning(
        JSON.stringify({ result: "executable", action: "set_field", field: "organizationId", value: "org_HACKED" }),
      ),
    });
    expect(outcome).toEqual({ kind: "invalid_output" });
  });

  it("passes the active tab through into the system prompt so the model has that context", async () => {
    let capturedSystemPrompt = "";
    await resolveCustomerEditCommand({
      utterance: "Sekmeyi değiştir.",
      activeTab: "financial",
      generateText: async ({ systemPrompt }) => {
        capturedSystemPrompt = systemPrompt;
        return JSON.stringify({ result: "unsupported" });
      },
    });
    expect(capturedSystemPrompt).toContain("financial");
  });
});
