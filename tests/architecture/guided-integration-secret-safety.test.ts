import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONNECTION_DESCRIPTORS } from "../../src/lib/integrations/connection-descriptors";
import { METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS } from "../../src/lib/agent/metrix-executive-contract";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(ts|tsx)$/.test(name)
        ? [path]
        : [];
  });
}

describe("guided integration — architecture and secret safety guardrails", () => {
  it("adds no second Agent, router, planner or classifier: the Executive is still the only Agent", () => {
    const offenders = sourceFiles("src").filter(
      (file) => !file.startsWith("src/generated") && /new Agent\b/.test(read(file))
    );

    expect(offenders).toEqual(["src/lib/agent/metrix-executive-agent.ts"]);

    for (const file of sourceFiles("src/lib/integrations")) {
      expect(read(file)).not.toMatch(/@openai\/agents|from ["']openai["']/);
    }
  });

  it("exposes no BizimHesap-specific semantic tool — BizimHesap data is read through the canonical capabilities", () => {
    const toolFiles = readdirSync("src/lib/agent/tools");

    expect(toolFiles.filter((name) => /bizim/i.test(name))).toEqual([]);
    expect(read("src/lib/agent/tools/metrix-business-tool-runtime.ts")).not.toMatch(
      /name: "bizimhesap_/
    );
  });

  it("provider descriptors carry the shape of a secret field, never a value or a provider URL", () => {
    const serialized = JSON.stringify(CONNECTION_DESCRIPTORS);

    expect(serialized).not.toMatch(/https?:\/\//);
    expect(serialized).not.toMatch(/partner|BZMH|Bearer/i);

    const bizimHesap = CONNECTION_DESCRIPTORS.BIZIMHESAP;
    expect(bizimHesap.method).toBe("SECURE_CREDENTIAL");

    if (bizimHesap.method === "SECURE_CREDENTIAL") {
      expect(bizimHesap.submitUrl.startsWith("/api/")).toBe(true);
      expect(bizimHesap.fields.map((field) => field.name)).toEqual(["token"]);
      // The real, physically confirmed panel path — and nothing invented
      // beyond it; the value is not yet claimed to be a proven Token.
      const steps = bizimHesap.steps.join(" ");
      expect(bizimHesap.guidanceVerified).toBe(false);
      expect(steps).toContain("Ayarlar → Üyelik Bilgileri");
      expect(steps).toContain("Api Key(FirmID)");
      expect(steps).toContain("Zirve Express Aktarım Api Key");
      expect(steps).toMatch(/kullanma/);
      expect(steps).not.toMatch(/Entegrasyon|B2B|token/i);
      expect(bizimHesap.fields[0]?.label).toBe("BizimHesap Api Key(FirmID)");
    }
  });

  it("the secure field is a masked, non-persisting input and never logs, stores or navigates with its value", () => {
    const source = read("src/components/metrix-view/SecureCredentialPresentationView.tsx");

    expect(source).toContain('type="password"');
    expect(source).toContain('autoComplete="off"');
    expect(source).toContain("setValues({})");
    expect(source).not.toMatch(/console\./);
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    expect(source).not.toMatch(/location\.(href|assign|search)|URLSearchParams/);
    // Only the descriptor's own submit route receives it, as a JSON body.
    expect(source).toContain("fetch(presentation.submitUrl");
    expect(source).toContain("JSON.stringify(payload)");
    // The follow-up sent into the conversation is fixed text.
    expect(source).toContain("CONNECTED_FOLLOW_UP");
    expect(source).not.toMatch(/onPrompt\?\.\([^)]*(values|payload)/);
  });

  it("the connect route, actions and client never log and never put the credential into an error or response", () => {
    for (const file of [
      "src/app/api/integrations/bizimhesap/connect/route.ts",
      "src/lib/actions/bizimhesap-connect.ts",
      "src/lib/actions/bizimhesap-sync.ts",
      "src/lib/integrations/bizimhesap/bizimhesap-client.ts",
      "src/lib/integrations/bizimhesap/bizimhesap-sync.ts",
      "src/lib/actions/integration-connect.ts"
    ]) {
      const source = read(file);

      expect(source, file).not.toMatch(/console\./);
      // No error is ever constructed from a credential.
      expect(source, file).not.toMatch(/new [A-Za-z]*Error\([^)]*(token|credentials)/i);
    }

    const route = read("src/app/api/integrations/bizimhesap/connect/route.ts");
    expect(route).toContain('"Cache-Control": "no-store"');
    // Never rethrows: the framework would log request context with the failure.
    expect(route).not.toMatch(/throw error/);
  });

  it("text and voice share one integration path: same tool, same deterministic descriptor, same projection", () => {
    const bridge = read("src/lib/live/live-delegation-bridge.ts");
    const textRoute = read("src/app/api/metrix/route.ts");

    expect(bridge).toContain("projectCapabilityResults");
    expect(textRoute).toContain("projectCapabilityResults");

    // The one contract both surfaces run under carries the BizimHesap
    // guidance; there is no voice-only integration text.
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("BizimHesap");
    for (const file of sourceFiles("src/lib/live")) {
      expect(read(file), file).not.toMatch(/BIZIMHESAP|bizimhesap/i);
    }

    // Voice renders the same generic surface, so the same secure component.
    expect(read("src/app/voice/voice-session-client.tsx")).toContain("MetrixViewSurface");
  });

  it("BizimHesap's B2B Key is a code constant, not deployment configuration; the merchant token is never in code or env", () => {
    for (const file of sourceFiles("src")) {
      if (file.startsWith("src/generated")) continue;
      expect(read(file), file).not.toContain("BIZIMHESAP_PARTNER_KEY");
    }

    const client = read("src/lib/integrations/bizimhesap/bizimhesap-client.ts");
    expect(client).toContain('export const BIZIMHESAP_B2B_KEY = "BZMHB2B724018943908D0B82491F203F"');
    expect(client).not.toMatch(/process\.env/);
    expect(client).toContain("Token: credentials.token");

    // The constant is provider protocol, never handed to the model, the
    // presentation or the browser.
    for (const file of [
      "src/lib/integrations/connection-descriptors.ts",
      "src/lib/presentation/project-result.ts",
      "src/components/metrix-view/SecureCredentialPresentationView.tsx",
      "src/lib/agent/metrix-executive-contract.ts"
    ]) {
      expect(read(file), file).not.toMatch(/BZMHB2B|BIZIMHESAP_B2B_KEY/);
    }

    // No merchant token literal in any BizimHesap source file.
    for (const file of sourceFiles("src/lib/integrations/bizimhesap")) {
      expect(read(file), file).not.toMatch(/token\s*[:=]\s*["'][A-Za-z0-9-]{8,}["']/);
    }
  });

  it("the only console output in BizimHesap code is the schema diagnostic, and it can only describe structure", () => {
    const withConsole = sourceFiles("src")
      .filter((file) => /bizimhesap/i.test(file) && !file.startsWith("src/generated"))
      .filter((file) => /console\./.test(read(file)));

    expect(withConsole).toEqual([
      "src/lib/integrations/bizimhesap/bizimhesap-schema-diagnostic.ts"
    ]);

    const diagnostic = read("src/lib/integrations/bizimhesap/bizimhesap-schema-diagnostic.ts");
    expect(diagnostic).toContain("Object.keys(");
    expect(diagnostic).not.toMatch(/Object\.(values|entries)\([^)]*\)\s*\.(map|join)/);
    // It is given a body and an endpoint label — never credentials or headers.
    expect(diagnostic).not.toContain("credentials");
    expect(diagnostic).not.toMatch(/from "\.\/bizimhesap-client"/);
  });
});
