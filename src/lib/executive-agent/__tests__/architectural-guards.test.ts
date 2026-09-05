import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Grand Consolidation Operation, section 32/59: guards against the
 * architecture regressing back into a duplicate cognition owner or a
 * direct-Prisma reasoning layer. These are ownership invariants, not
 * feature-behavior tests.
 */

const agentDir = resolve(process.cwd(), "src/lib/executive-agent");
const routeSource = readFileSync(resolve(process.cwd(), "src/app/api/ai/chat/route.ts"), "utf8");

function collectFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : collectFiles(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

describe("Executive Agent architectural guards", () => {
  it("never imports the Prisma query client directly — company truth only via canonical tools", () => {
    for (const file of collectFiles(agentDir)) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must not import the Prisma client directly`).not.toContain("@/lib/core/shared/prisma");
      expect(source, `${file} must not import PrismaClient directly`).not.toContain("new PrismaClient");
    }
  });

  it("has no second, independent judgment-producing tool disguised as deterministic — buildCompanyQueryJudgment is retired, not toolified (comment mentions of the retired name are fine)", () => {
    for (const file of collectFiles(agentDir)) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must not import or call the retired company-query judgment producer`).not.toMatch(/buildCompanyQueryJudgment\(|import\s*{\s*buildCompanyQueryJudgment/);
    }
    expect(routeSource).not.toMatch(/buildCompanyQueryJudgment\(|import\s*{\s*buildCompanyQueryJudgment/);
  });

  it("route.ts has retired every old Executive cognition owner (EOS pipeline and the standing shadow chain)", () => {
    expect(routeSource).not.toContain("resolveChatExecutiveCognition(");
    expect(routeSource).not.toContain("buildExecutiveOperatingSystem(");
    expect(routeSource).not.toContain("buildExecutiveContextV2(");
    expect(routeSource).not.toContain("council = buildExecutiveCouncil");
    expect(routeSource).not.toContain("strategicProfile = buildStrategicProfile");
    expect(routeSource).not.toContain("decisionPackage = buildExecutiveDecisionPackage");
    expect(routeSource).not.toContain("brief = buildAIGeneralManagerBrief");
  });

  it("route.ts runs the METRIX Executive Agent exactly once per turn as the one narration owner", () => {
    expect((routeSource.match(/await runExecutiveAgent\(/g) ?? []).length).toBe(1);
    expect((routeSource.match(/streamWithAiGateway\(\{/g) ?? []).length).toBe(1);
  });

  it("every tool file exports only tool builders and pure helpers — no route/page/API-handler exports", () => {
    for (const file of collectFiles(join(agentDir, "tools"))) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must not export a Next.js route handler`).not.toMatch(/export\s+(async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)\b/);
    }
  });

  it("write and action tools only ever propose operations through executeCanonicalOperation or runOrchestration — never a raw fetch/HTTP call to a vendor", () => {
    const writeSource = readFileSync(join(agentDir, "tools/company-canonical-tools.ts"), "utf8");
    const actionSource = readFileSync(join(agentDir, "tools/action-tools.ts"), "utf8");
    expect(writeSource).toContain("executeCanonicalOperation(");
    expect(actionSource).toContain("runOrchestration(");
    for (const source of [writeSource, actionSource]) {
      expect(source).not.toMatch(/\bfetch\(/);
    }
  });
});
