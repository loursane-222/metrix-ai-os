import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Source-contract test, same style as single-authority-source-contract.test.ts.
// Proves every user-visible error surface in the main chat component
// (setError / setApprovalDecisionError, both rendered inline in the
// conversation/activity panel via ErrorNote) resolves through the single
// governed fallback authority, never a caught exception's own .message,
// never a raw SSE event field. English/Prisma/stack/route/provider/internal
// exception text has no code path left to reach the user through this file.
const source = readFileSync(new URL("../MetrixChatTab.tsx", import.meta.url), "utf8");

describe("MetrixChatTab — no raw exception leak contract", () => {
  it("imports the single governed fallback authority", () => {
    expect(source).toContain('import { buildExecutiveFallbackResponse } from "@/lib/ai/identity/executive-fallback-response"');
  });

  it("never renders a raw SSE event.message to the user", () => {
    expect(source).not.toMatch(/setError\(String\(event\.message/);
    expect(source).not.toMatch(/setError\(event\.message/);
  });

  it("never renders a caught exception's own .message in the main conversation error surface", () => {
    // Only SettingsMenu's own local, non-Executive-voiced "Ayarlar" panel
    // (a distinct component/surface, not the conversation) is exempt — every
    // other setError/setApprovalDecisionError call site in this file must
    // not read `cause.message` / `err.message`.
    const withoutSettingsMenu = source.slice(0, source.indexOf("function SettingsMenu"));
    expect(withoutSettingsMenu).not.toMatch(/setError\(cause instanceof Error \? cause\.message/);
    expect(withoutSettingsMenu).not.toMatch(/setApprovalDecisionError\(cause instanceof Error \? cause\.message/);
  });

  it("every setError/setApprovalDecisionError fallback call site (outside curated API-error branches) uses buildExecutiveFallbackResponse", () => {
    const withoutSettingsMenu = source.slice(0, source.indexOf("function SettingsMenu"));
    const fallbackCalls = withoutSettingsMenu.match(/set(?:Error|ApprovalDecisionError)\((?!null\)|json\.error\.message\))[^)]*\)/g) ?? [];
    expect(fallbackCalls.length).toBeGreaterThan(0);
    for (const call of fallbackCalls) {
      expect(call).toContain("buildExecutiveFallbackResponse(");
    }
  });
});
