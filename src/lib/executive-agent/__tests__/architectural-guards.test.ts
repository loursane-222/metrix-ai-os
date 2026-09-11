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

  it("Stage 2 (Executive Awareness Runtime) delegates significance/intervene judgment to the Executive Agent — it never computes its own severity threshold or calls notify() directly", () => {
    const watchDir = resolve(process.cwd(), "src/lib/executive-autonomous-watch");
    const runtimeSource = readFileSync(join(watchDir, "executive-autonomous-watch.service.ts"), "utf8");

    expect(runtimeSource).toContain("runAwarenessJudgment(");
    expect(runtimeSource).not.toMatch(/from\s+["']@\/lib\/core\/notifications\/notification\.service["']/);
    expect(runtimeSource).not.toMatch(/\bnotify\(/);
    expect(runtimeSource).not.toMatch(/severity\s*===\s*["'](CRITICAL|HIGH)["']/);

    // The delivery adapter may call notify(), but must never itself decide
    // disposition/significance — it only reads a judgment already made.
    const deliverySource = readFileSync(join(watchDir, "executive-autonomous-watch-delivery.service.ts"), "utf8");
    expect(deliverySource).not.toMatch(/disposition\s*=\s*["'](SILENT|INTERVENE)["']/);
  });
});

/**
 * Early Workspace Delivery operation: open_workspace's navigation SSE event
 * now fires synchronously at tool completion (inside runExecutiveAgent),
 * not after the whole Agent run — including its narration-only turn —
 * resolves. These guards prove the safety contract that change must
 * preserve, without a runtime/SDK integration harness: exactly one dispatch
 * site, gated on real tool success, gated on the turn not already being
 * superseded/aborted, reusing the one existing SSE transport, and never
 * reachable from the direct-mutation tool.
 */
describe("Early Workspace Delivery safety contract", () => {
  const runtimeSource = readFileSync(join(agentDir, "runtime.ts"), "utf8");
  const workspaceToolsSource = readFileSync(join(agentDir, "tools/workspace-tools.ts"), "utf8");
  const actionToolsSource = readFileSync(join(agentDir, "tools/action-tools.ts"), "utf8");

  it("fires the early-delivery callback in the same statement that accumulates workspaceNavigation — not after streamed.completed", () => {
    expect(runtimeSource).toContain("workspaceNavigation = payload; onWorkspaceNavigate?.(payload); }");
    // The callback must be invoked from inside buildExecutiveTools' own
    // callback (i.e. at tool-execute time), strictly before the function
    // awaits the rest of the stream — never re-derived from the accumulated
    // variable after the run completes.
    const toolsCallIndex = runtimeSource.indexOf("workspaceNavigation = payload; onWorkspaceNavigate?.(payload); }");
    const streamedCompletedIndex = runtimeSource.indexOf("await streamed.completed");
    expect(toolsCallIndex).toBeGreaterThan(-1);
    expect(streamedCompletedIndex).toBeGreaterThan(toolsCallIndex);
  });

  it("route.ts has exactly one navigation dispatch site left for Executive tool calls — no post-run duplicate", () => {
    expect(routeSource).not.toContain("agentRunResult.workspaceNavigation");
    expect(routeSource).not.toMatch(/if \(agentRunResult\.stopReason === "completed" && agentRunResult\.workspaceNavigation\)/);
    // The early-delivery callback passed into runExecutiveAgent is the only
    // remaining call site that dispatches on the Agent's own tool decision.
    // 3 occurrences total: 1 function declaration + 1 business-navigation's
    // own pre-Executive call + 1 Executive early-delivery call. No third
    // call site (which would mean a reintroduced post-run duplicate).
    expect((routeSource.match(/enqueueNavigationEvent\(/g) ?? []).length).toBe(3);
    expect((routeSource.match(/type: "navigation"/g) ?? []).length).toBe(1); // single shared transport, unchanged
  });

  it("route.ts's early-delivery callback is guarded by the same deliveryAbort check every other stream chunk already uses — a superseded/aborted turn cannot still open a workspace", () => {
    expect(routeSource).toMatch(/\(payload\) => \{\s*if \(deliveryAbort\.signal\.aborted\) return;\s*enqueueNavigationEvent\(crypto\.randomUUID\(\), payload\);\s*\}/);
  });

  it("open_workspace only ever calls onWorkspaceNavigate from its OPENED/success branches — never from MISSING_ENTITY/NOT_FOUND/AMBIGUOUS/UNSUPPORTED", () => {
    const calls = [...workspaceToolsSource.matchAll(/onWorkspaceNavigate\(/g)];
    expect(calls.length).toBe(2);
    for (const call of calls) {
      const followingText = workspaceToolsSource.slice(call.index, call.index + 400);
      expect(followingText).toMatch(/status: "OPENED" as const/);
    }
    // And the failure statuses never precede a call to it.
    expect(workspaceToolsSource).not.toMatch(/status: "(MISSING_ENTITY|NOT_FOUND|AMBIGUOUS|UNSUPPORTED)" as const[^}]*\}\s*\);\s*\n\s*onWorkspaceNavigate\(/);
  });

  it("execute_business_action (direct mutations) never receives or calls onWorkspaceNavigate — structurally cannot produce a workspace navigation event", () => {
    expect(actionToolsSource).not.toContain("onWorkspaceNavigate");
    expect(actionToolsSource).not.toContain("ExecutiveWorkspaceNavigation");
  });

  it("the early-delivery callback reuses the one shared enqueueNavigationEvent helper (which already derives source from channel) — no separate voice/text branch was introduced", () => {
    const helperIndex = routeSource.indexOf("function enqueueNavigationEvent(");
    const earlyCallbackIndex = routeSource.indexOf("if (deliveryAbort.signal.aborted) return;\n                enqueueNavigationEvent(crypto.randomUUID(), payload);");
    expect(helperIndex).toBeGreaterThan(-1);
    expect(earlyCallbackIndex).toBeGreaterThan(-1);
    // The helper itself (the only place either dispatch site can set
    // "source") derives it from channel — neither call site passes its own
    // literal, so both get identical voice/text behavior for free.
    const helperBody = routeSource.slice(helperIndex, helperIndex + 700);
    expect(helperBody).toContain('source: channel === "voice" ? "voice" : "written"');
    expect(routeSource.slice(earlyCallbackIndex - 50, earlyCallbackIndex + 150)).not.toMatch(/source:\s*["'](voice|written)["']/);
  });
});
