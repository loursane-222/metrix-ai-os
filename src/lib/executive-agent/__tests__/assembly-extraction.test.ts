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
    expect(hash(body(declaration(assembly, "buildExecutiveTools"))))
      .toBe("efa18bf367d1d95c8abcf36f94079b4502f78f597c5ad73bcd1c633932a5bbbf");
    const imports = assembly.slice(assembly.indexOf("import { buildCompanyReadTool"), assembly.indexOf("export function buildExecutiveInstructions")).trim();
    expect(hash(imports)).toBe("fd523e4979285976f4a3f091f742e311eac33273ac0206fc686ca8c779004aad");
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
    expect(hash(declaration(runtime, "runExecutiveAgent")))
      .toBe("346f52c58132921e7fc16d8ce740b0565f8a30156f1558708f5e53f0c2ce5ae9");
  });
});
