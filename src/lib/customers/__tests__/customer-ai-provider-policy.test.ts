import { afterEach, describe, expect, it, vi } from "vitest";
import { generateCustomerCreatePlanText } from "../customer-create-conversation-ai-adapter";
import { generateCustomFieldPlanText } from "../customer-custom-field-conversation-ai-adapter";
import { generateCustomerEditCommandText } from "../customer-edit-command-ai-adapter";

afterEach(() => vi.unstubAllEnvs());

describe("customer AI adapters production provider policy", () => {
  it.each([
    ["customer create", generateCustomerCreatePlanText],
    ["custom field", generateCustomFieldPlanText],
    ["customer edit", generateCustomerEditCommandText],
  ])("%s cannot silently select mock in production", async (_name, generate) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AI_PROVIDER", "");
    await expect(generate({ systemPrompt: "system", userMessage: "message" }))
      .rejects.toThrow("AI_PROVIDER must be explicitly configured as openai");
  });
});
