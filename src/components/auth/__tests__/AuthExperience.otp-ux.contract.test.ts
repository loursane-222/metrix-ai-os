import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/components/auth/AuthExperience.tsx"), "utf8");

describe("OTP login UX contract", () => {
  it("shows delivery and Spam/Junk guidance", () => {
    expect(source).toContain("Doğrulama kodu gönderildi.");
    expect(source).toContain("Spam / Junk klasörünü de kontrol edin.");
  });

  it("guards loading, double click, cooldown and resend", () => {
    expect(source).toContain('if (busy || (step === "otp" && seconds > 0)) return');
    expect(source).toContain("disabled={busy || seconds > 0}");
    expect(source).toContain("Kodu tekrar gönder");
    expect(source).toContain("Kod gönderiliyor…");
  });

  it("surfaces success, provider and network failures as accessible toasts", () => {
    expect(source).toContain('kind: "success"');
    expect(source).toContain('kind: "error"');
    expect(source).toContain("Ağ bağlantısı kurulamadı.");
    expect(source).toContain('aria-live={toast.kind === "error" ? "assertive" : "polite"}');
    expect(source).toContain('aria-label="Bildirimi kapat"');
  });
});
