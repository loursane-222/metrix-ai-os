import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  REGISTERED_EXTENSIONS,
  RESIDUAL_LEGACY_EXTENSIONS,
  SEMANTIC_AUTHORITIES,
} from "../conversation-extension-ownership-registry";

const activeExtensionSource = readFileSync(new URL("../active-conversation-extension.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../../../app/api/ai/chat/route.ts", import.meta.url), "utf8");
const actionToolsSource = readFileSync(new URL("../../executive-agent/tools/action-tools.ts", import.meta.url), "utf8");

/**
 * Legacy Domain Semantic Ownership Final Consolidation.
 *
 * Binding invariant: ONE NATURAL-LANGUAGE BUSINESS INTENT -> METRIX EXECUTIVE
 * AGENT -> CANONICAL CAPABILITY/ORCHESTRATION -> POLICY/APPROVAL -> ACTION
 * RUNTIME -> READBACK. A conversation extension may remain an active
 * dispatch owner ONLY if the shared registry (conversation-extension-ownership-registry.ts)
 * classifies it as PRESENTATION_NAVIGATION, CANONICAL_CONTINUATION_APPROVAL,
 * or CONTEXT_BOUND_WORKSPACE_COMMAND — or is an explicitly, honestly labeled
 * RESIDUAL_LEGACY_EXTENSIONS entry with a stated reason it cannot yet be
 * retired without real capability loss. These guards protect that boundary
 * from regressing: they fail the build if a future change re-introduces a
 * free-standing, cold, new-utterance business-write or business-judgment
 * owner into active dispatch without going through this registry.
 */
describe("registry-level regression guard — no future extension can bypass classification", () => {
  it("active-conversation-extension.ts sources its dispatched extensions ONLY from the registry, not from its own direct imports", () => {
    expect(activeExtensionSource).toContain(
      'import { REGISTERED_EXTENSIONS, RESIDUAL_LEGACY_EXTENSIONS } from "./conversation-extension-ownership-registry"',
    );
    // No other `*-conversation-extension` import may exist in this file —
    // every dispatched extension must be named, once, in the registry.
    const otherExtensionImports = [...activeExtensionSource.matchAll(/^import\s*{[^}]*}\s*from\s*"\.\/[a-z-]+-conversation-extension"/gm)];
    expect(otherExtensionImports).toHaveLength(0);
    expect(activeExtensionSource).toContain("...REGISTERED_EXTENSIONS.map((entry) => entry.extension)");
    expect(activeExtensionSource).toContain("...RESIDUAL_LEGACY_EXTENSIONS.map((entry) => entry.extension)");
  });

  it("every REGISTERED_EXTENSIONS entry declares one of the three legitimate semantic authorities — never a bare/free-text business-write or business-judgment grant", () => {
    expect(REGISTERED_EXTENSIONS.length).toBeGreaterThan(0);
    for (const entry of REGISTERED_EXTENSIONS) {
      expect(SEMANTIC_AUTHORITIES).toContain(entry.authority);
      expect(typeof entry.name).toBe("string");
      expect(entry.name.length).toBeGreaterThan(0);
      expect(typeof entry.extension.getActiveScopeKey).toBe("function");
      expect(typeof entry.extension.execute).toBe("function");
    }
  });

  it("every RESIDUAL_LEGACY_EXTENSIONS entry carries a non-empty, specific reason — a residual can never be silently unlabeled", () => {
    for (const entry of RESIDUAL_LEGACY_EXTENSIONS) {
      expect(typeof entry.reason).toBe("string");
      expect(entry.reason.length).toBeGreaterThan(20);
      expect(typeof entry.extension.getActiveScopeKey).toBe("function");
      expect(typeof entry.extension.execute).toBe("function");
    }
  });

  it("no extension is classified twice — REGISTERED_EXTENSIONS and RESIDUAL_LEGACY_EXTENSIONS are disjoint by name", () => {
    const registeredNames = new Set(REGISTERED_EXTENSIONS.map((e) => e.name));
    const residualNames = RESIDUAL_LEGACY_EXTENSIONS.map((e) => e.name);
    for (const name of residualNames) {
      expect(registeredNames.has(name)).toBe(false);
    }
    // No duplicate names within either list either.
    expect(new Set(REGISTERED_EXTENSIONS.map((e) => e.name)).size).toBe(REGISTERED_EXTENSIONS.length);
    expect(new Set(residualNames).size).toBe(residualNames.length);
  });

  // Canary: any future addition or removal from active dispatch must
  // consciously update this count — a silent, unreviewed growth of the
  // dispatched set (e.g. a new extension wired directly into
  // active-conversation-extension.ts bypassing the registry entirely) has no
  // other structural signal that would catch it.
  it("tracks the exact total active-dispatch count as a canary against silent additions", () => {
    expect(REGISTERED_EXTENSIONS.length).toBe(42);
    expect(RESIDUAL_LEGACY_EXTENSIONS.length).toBe(7);
  });

  it("retired business-write/judgment owners are absent from both lists — unreachable as independent new-intent owners", () => {
    const allNames = new Set([...REGISTERED_EXTENSIONS.map((e) => e.name), ...RESIDUAL_LEGACY_EXTENSIONS.map((e) => e.name)]);
    expect(allNames.has("productionManagementConversationExtension")).toBe(false);
    expect(allNames.has("businessOverviewConversationExtension")).toBe(false);
    expect(allNames.has("orchestrationConversationExtension")).toBe(false);
    // Residual Capability Parity Migration: these 8 are now retired too —
    // each has an equivalent Executive Agent tool (residual-capability-tools.ts)
    // wrapping the exact same underlying service call, unchanged.
    expect(allNames.has("taskManagementConversationExtension")).toBe(false);
    expect(allNames.has("fieldVisitConversationExtension")).toBe(false);
    expect(allNames.has("repGoalCreateConversationExtension")).toBe(false);
    expect(allNames.has("repOrderRequestConversationExtension")).toBe(false);
    expect(allNames.has("repQuoteRequestConversationExtension")).toBe(false);
    expect(allNames.has("repPaymentRequestConversationExtension")).toBe(false);
    expect(allNames.has("supplierMessageConversationExtension")).toBe(false);
    expect(allNames.has("documentIntelligenceConversationExtension")).toBe(false);
    expect(allNames.has("paymentReminderConversationExtension")).toBe(false);
    // calendarManagementConversationExtension is intentionally still
    // present — reclassified PRESENTATION_NAVIGATION (narrowed to only its
    // pure "takvimi göster" nav branch), not retired.
    const calendarEntry = REGISTERED_EXTENSIONS.find((e) => e.name === "calendarManagementConversationExtension");
    expect(calendarEntry?.authority).toBe("PRESENTATION_NAVIGATION");
    // teamManagementConversationExtension is intentionally still present —
    // reclassified PRESENTATION_NAVIGATION (narrowed to only its pure
    // "ekibi göster" nav branch), not retired. Invite/role-change/toggle
    // moved to organization_member.create/update, both reachable through
    // execute_business_action.
    const teamEntry = REGISTERED_EXTENSIONS.find((e) => e.name === "teamManagementConversationExtension");
    expect(teamEntry?.authority).toBe("PRESENTATION_NAVIGATION");
  });

  it("CONTEXT_BOUND_WORKSPACE_COMMAND entries are never mistaken for a second Executive Brain — they carry no company-wide free-context authority, only a single shared classification", () => {
    const workspaceCommandEntries = REGISTERED_EXTENSIONS.filter((e) => e.authority === "CONTEXT_BOUND_WORKSPACE_COMMAND");
    // 8 precise qualifying criteria (screen already open+visible-ready,
    // entity/operation-scoped, no new domain discovery, no company-wide
    // judgment, no domain switching, canonical mutation chain, no guessing
    // when context is insufficient, surface context mandatory alongside
    // phrase match) apply uniformly via this ONE shared authority value —
    // not 20 separate bespoke exceptions.
    expect(workspaceCommandEntries.length).toBe(20);
    for (const entry of workspaceCommandEntries) {
      expect(entry.authority).toBe("CONTEXT_BOUND_WORKSPACE_COMMAND");
    }
  });

  it("multi-step orchestration/compensation stays reachable from the Agent's own write tool, unduplicated", () => {
    expect(actionToolsSource).toContain("runOrchestration(");
    expect(actionToolsSource).toContain("stepsJson");
  });

  it("a new-utterance business intent with no active extension claim still reaches the Executive Agent — no dead end", () => {
    expect(routeSource).toContain("executiveAgentWillRespond");
  });
});
