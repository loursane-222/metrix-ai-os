import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const assembly = readFileSync(new URL("../assembly.ts", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../runtime.ts", import.meta.url), "utf8");
function declaration(source: string, name: string) {
  const file = ts.createSourceFile("source.ts", source, ts.ScriptTarget.Latest, true);
  const node = file.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  if (!node) throw new Error(`Missing function: ${name}`);
  return node.getText(file);
}
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const body = (text: string) => text.slice(text.indexOf("{"));

// Captured from the working runtime immediately BEFORE R2 extraction.
// Exact bodies/imports prove parity for every context, tool builder, argument,
// callback and ordering, without running tools or making model/DB requests.
describe("mechanical Executive assembly extraction", () => {
  it("preserves instruction assembly byte-for-byte, including prompt interpolation", () => {
    expect(hash(body(declaration(assembly, "buildExecutiveInstructions"))))
      .toBe("b4fcb8843d209a1478e43bf53424e5a67fcedb98808881a5234d47e2e33bf6c9");
    expect(assembly).toContain('import { EXECUTIVE_CONSTITUTION } from "./constitution"');
    expect(assembly).toContain('import { PROGRESSIVE_DELIVERY_INSTRUCTIONS } from "./progressive-delivery"');
  });

  it("preserves the same tool implementations, set, order and callback wiring", () => {
    // Hash intentionally updated (OpenAI-Native Jarvis Interaction Phase 1):
    // buildExecutiveTools now also wires open_workspace and its
    // onWorkspaceNavigate callback — a real, deliberate addition, not drift.
    expect(hash(body(declaration(assembly, "buildExecutiveTools"))))
      .toBe("6a17980a6e7eddd0a8146802c2e8ecf2c945ffd0e6a937d69b7d02b33f5384fe");
    const imports = assembly.slice(assembly.indexOf("import { buildCompanyReadTool"), assembly.indexOf("export function buildExecutiveInstructions")).trim();
    expect(hash(imports)).toBe("94ae3abf9dff969ea6507dfb0e6b563eb9ded8c4e39d74456b118fdbdb7f67f5");
  });

  it("runtime consumes shared assembly with no local assembly duplicate", () => {
    expect(runtime).toContain('import { buildExecutiveInstructions, buildExecutiveTools } from "./assembly"');
    expect(runtime).not.toContain("function buildInstructions");
    expect(runtime).not.toContain("function buildTools");
    expect(runtime).toContain("instructions: buildExecutiveInstructions(runContext, input.organizationSummary, input.artifactFormatHint)");
    expect(runtime).toContain("tools: buildExecutiveTools(runContext,");
  });

  it("preserves the entire model loop and timing wrapper after the two symbol renames", () => {
    expect(hash(declaration(runtime, "withTiming")))
      .toBe("ac3fe2eb40dc9f80f1a1457b3eefbf7c06955776d40b3be222f39008c62d038c");
    // Hash intentionally updated (Early Workspace Delivery operation):
    // runExecutiveAgent now accepts an optional onWorkspaceNavigate callback,
    // fired synchronously at tool completion — a real, deliberate addition.
    expect(hash(declaration(runtime, "runExecutiveAgent")))
      .toBe("4b2fa4d5510c2b63e11105ed1253845f521b0f57007826ad940798569f268248");
  });
});
