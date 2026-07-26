import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const source = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("ActionResultV1 authority boundaries", () => {
  it("does not make ExecutionRuntime depend on the projection", () => {
    expect(source("src/lib/action-runtime/execution/execution-runtime.ts"))
      .not.toContain("action-result");
  });

  it("does not make chat, voice, or ExecutiveOutcome a result producer", () => {
    expect(source("src/app/api/ai/chat/route.ts")).not.toContain("projectActionResultV1");
    expect(source("src/lib/executive-outcome/executive-outcome.adapter.ts"))
      .not.toContain("projectActionResultV1");
  });

  it("keeps projection free of persistence and execution authority", () => {
    const adapter = source("src/lib/action-result/action-result.adapter.ts");
    expect(adapter).not.toMatch(/prisma|executeAction|sendAiMessage/u);
    expect(adapter).not.toMatch(/\bawait\b/u);
  });

  it("keeps the handoff one-way and non-canonical", () => {
    const handoff = source("src/lib/conversation-extensions/conversation-extension-handoff.ts");
    expect(handoff).toContain("projectActionResultToCustomerHandoff");
    expect(handoff).not.toContain("projectHandoffToActionResult");
  });
});
