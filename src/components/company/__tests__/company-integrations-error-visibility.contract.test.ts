import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../CompanyOperatingScreen.tsx", import.meta.url), "utf8");
const connectRoute = readFileSync(new URL("../../../app/api/integrations/icloud/connect/route.ts", import.meta.url), "utf8");

/**
 * iCloud Production Connection Failure fix. Root cause: the shared api()
 * helper's error extraction — `payload.error ?? "..."` — was always truthy
 * (every fail()/authFail() response shapes error as {message: string}, an
 * object, never a bare string), so `new Error(payload.error)` stringified
 * to the literal "[object Object]" instead of the real server message for
 * EVERY failed call this screen makes, not just iCloud. That is what made a
 * real connect failure (proven separately: INTEGRATION_SECRET_ENCRYPTION_KEY
 * is not configured in production, so encryptIntegrationSecret() throws
 * after a successful CalDAV discovery) look like "no visible error" — the
 * notice banner briefly showed unreadable noise instead of the actual
 * reason.
 */
describe("CompanyOperatingScreen — api() surfaces the real server error message, not [object Object]", () => {
  it("extracts payload.error.message (or a bare string) instead of stringifying the error object itself", () => {
    expect(source).toContain('throw new Error((typeof payload.error === "string" ? payload.error : payload.error?.message) || "İşlem tamamlanamadı.");');
    expect(source).not.toContain('throw new Error(payload.error ?? "İşlem tamamlanamadı.");');
  });
});

describe("IcloudPanel — connect/disconnect never silently return to a blank form with no visible state", () => {
  it("keeps a persistent, panel-local error state instead of relying only on the shared, always-green, auto-dismissing notice banner", () => {
    expect(source).toContain("const [connectError, setConnectError] = useState<string | null>(null);");
    expect(source).toContain('role="alert" className="text-xs text-[#f16a7a] sm:col-span-2">{connectError}');
  });

  it("re-checks real connection status after a successful POST before clearing the form or claiming success — a connect that returns 200 but doesn't actually persist must still surface an explicit message", () => {
    expect(source).toContain("const refreshed = await load();");
    expect(source).toContain("if (refreshed.connected) {");
    expect(source).toContain("durum onaylanamadı");
  });

  it("disconnect() also surfaces a real error instead of failing silently", () => {
    const icloudPanelSource = source.slice(source.indexOf("function IcloudPanel("));
    const disconnectFn = icloudPanelSource.slice(icloudPanelSource.indexOf("const disconnect = async () => {"), icloudPanelSource.indexOf("const disconnect = async () => {") + 400);
    expect(disconnectFn).toContain("} catch (error) {");
    expect(disconnectFn).toContain("await onComplete((error as Error).message);");
  });
});

describe("icloud/connect route — safe, credential-free diagnostic logging exists for future incidents", () => {
  it("logs the discovery outcome on failure, never the Apple ID or app-specific password", () => {
    expect(connectRoute).toContain('console.error("[icloud/connect] discovery failed:", error.message);');
    expect(connectRoute).not.toMatch(/console\.(log|error|warn)\([^)]*appSpecificPassword/i);
    expect(connectRoute).not.toMatch(/console\.(log|error|warn)\([^)]*\bappleId\b/i);
  });
});
