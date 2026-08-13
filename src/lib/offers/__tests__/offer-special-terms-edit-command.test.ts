import { describe, expect, it } from "vitest";

import { OFFER_EDIT_FIELD_REGISTRY } from "../offer-field-registry";
import { applyOfferEditCommand } from "../offer-edit-command-apply";
import { resolveOfferEditCommand } from "../offer-edit-command-resolver";
import type { SurfaceActionInput } from "../offer-edit-surface-runtime";

describe("offer special terms edit command", () => {
  it("exposes specialTerms through the shared registry and resolves a written field command", async () => {
    expect(OFFER_EDIT_FIELD_REGISTRY.fields.find((field) => field.key === "specialTerms")).toMatchObject({
      label: "Özel koşullar",
      valueType: "multiline_string",
      writable: true,
      normalization: "trim",
    });

    const outcome = await resolveOfferEditCommand({
      utterance: "Özel koşullara kurulum dahildir yaz.",
      activeTab: "terms",
      generateText: async () => JSON.stringify({
        result: "executable",
        action: "set_field",
        field: "specialTerms",
        value: "Kurulum dahildir.",
      }),
    });

    expect(outcome).toEqual({
      kind: "resolved",
      resolution: {
        kind: "executable",
        command: { type: "set_field", field: "specialTerms", value: "Kurulum dahildir." },
      },
    });

    if (outcome.kind !== "resolved" || outcome.resolution.kind !== "executable") throw new Error("Expected executable command.");
    const actions: SurfaceActionInput[] = [];
    const execution = await applyOfferEditCommand(outcome.resolution.command, {
      getState: () => ({ activeTab: "terms" }) as never,
      executeSurfaceAction: async (action) => { actions.push(action); },
    });
    expect(execution.status).toBe("EXECUTED");
    expect(actions).toEqual([{ actionName: "draft.set_field", payload: { fieldName: "specialTerms", value: "Kurulum dahildir." } }]);
  });
});
