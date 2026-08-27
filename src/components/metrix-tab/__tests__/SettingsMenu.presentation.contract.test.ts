import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/components/metrix-tab/MetrixChatTab.tsx"), "utf8");
const css = readFileSync(resolve(process.cwd(), "src/components/metrix-tab/SettingsMenu.module.css"), "utf8");
const settings = source.slice(source.indexOf("function SettingsMenu"), source.indexOf("// ─── SVG Icons"));

describe("Settings V1 production presentation contract", () => {
  it("keeps the existing conversation-owned behavior and persistence chain", () => {
    expect(source).toContain("toggleSettings: () => setIsSettingsOpen((value) => !value)");
    expect(settings).toContain('fetch("/api/user/profile", { credentials: "include" })');
    expect(settings).toContain('method: "PATCH"');
    expect(settings).toContain('fetch("/api/auth/logout", { method: "POST", credentials: "include" })');
    expect(settings).toContain("sessionStorage.removeItem(CONVERSATION_STORAGE_KEY)");
    expect(settings).toContain("window.location.replace(\"/\")");
    expect(settings).toContain("if (event.key === \"Escape\") onClose()");
    expect(settings).toContain("if (event.target === event.currentTarget) onClose()");
    expect(settings).toContain('querySelector<HTMLButtonElement>("button")?.focus()');
  });

  it("exposes only the real Settings capabilities and fields", () => {
    for (const label of ["Hesap Ayarları", "Metrix Filmi", "Çıkış Yap", "Ad Soyad", "E-posta", "Saat Dilimi", "Geri", "Kaydet"]) {
      expect(settings).toContain(label);
    }
    expect(settings).not.toMatch(/Bildirimler|Görünüm|Tema|Organizasyon Ayarları/);
  });

  it("preserves the approved desktop geometry and mobile reflow", () => {
    expect(css).toContain("width:min(1112px,calc(100% - 64px))");
    expect(css).toContain("grid-template-columns:352px minmax(0,1fr)");
    expect(css).toContain("border-radius:34px");
    expect(css).toContain("@media(max-width:900px)");
    expect(css).toContain("grid-template-columns:1fr");
    expect(css).toContain("overflow:auto");
  });
});
