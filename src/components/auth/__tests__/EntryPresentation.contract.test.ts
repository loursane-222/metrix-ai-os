import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const auth = readFileSync(resolve(process.cwd(), "src/components/auth/AuthExperience.tsx"), "utf8");
const organization = readFileSync(resolve(process.cwd(), "src/components/auth/OrganizationSetup.tsx"), "utf8");
const entry = readFileSync(resolve(process.cwd(), "src/app/metrix-onboarding-app.tsx"), "utf8");
describe("approved Login and Post-Auth V1 production presentation", () => {
  it("preserves the complete email and OTP interaction contract", () => {
    expect(auth).toContain('htmlFor="login-email"');
    expect(auth).toContain("rememberMe");
    expect(auth).toContain("login-consent-copy");
    expect(auth).toContain('autoComplete="one-time-code"');
    expect(auth).toContain('inputMode="numeric"');
    expect(auth).toContain('maxLength={6}');
    expect(auth).toContain('pattern="[0-9]{6}"');
    expect(auth).toContain("E-posta adresini değiştir");
    expect(auth).toContain("Kodu tekrar gönder");
    expect(auth).toContain("disabled={busy || seconds > 0}");
    expect(auth).toContain("Kod gönderiliyor…");
    expect(auth).toContain("Doğrulanıyor…");
  });
  it("preserves organization creation authority and the single real field", () => {
    expect(organization).toContain('fetch("/api/organizations"');
    expect(organization).toContain("await onCreated()");
    expect(organization).toContain('htmlFor="organization-name"');
    expect(organization).toContain("disabled={busy || !name.trim()}");
    expect(organization).not.toMatch(/skip|industry|teamSize/);
  });
  it("keeps EntryLoading honest and removes the small M badge", () => {
    expect(entry).toContain("METRIX hazırlanıyor");
    expect(entry).toContain("<Presence loading />");
    expect(entry).not.toContain("mini-mark");
    expect(entry).not.toContain(">M</span>");
    expect(entry).not.toMatch(/progress|diagnostic|percentage/);
  });
});
