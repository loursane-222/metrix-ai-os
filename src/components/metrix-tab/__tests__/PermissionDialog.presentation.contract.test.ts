import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const chat = readFileSync(join(root, "src/components/metrix-tab/MetrixChatTab.tsx"), "utf8");
const styles = readFileSync(join(root, "src/components/metrix-tab/PermissionDialog.module.css"), "utf8");

describe("approved microphone PermissionDialog V1 contract", () => {
  it("keeps the exact explainer copy and only the two real actions", () => {
    expect(chat).toContain('title="Mikrofon erişimi"');
    expect(chat).toContain('description="Metrix’le sesli konuşabilmek için mikrofon erişimine izin vermeniz gerekiyor."');
    expect(chat).toContain('primary="Mikrofonu Aç"');
    expect(chat).toContain("Şimdilik Değil");
    expect(chat).not.toContain("Ayarları Aç");
  });

  it("retains the existing cancel and voice-start wiring", () => {
    expect(chat).toContain('onCancel={() => setShowMicPrompt(false)}');
    expect(chat).toContain('onConfirm={() => void startVoice()}');
    expect(chat).toContain('setShowMicPrompt(false);\n\n    setMicPermission("requesting")');
    expect(chat).toContain("await orchestrator.start()");
  });

  it("provides local dialog accessibility without backdrop dismissal", () => {
    expect(chat).toContain('role="dialog"');
    expect(chat).toContain('aria-modal="true"');
    expect(chat).toContain('aria-labelledby="permission-title"');
    expect(chat).toContain('aria-describedby="permission-description"');
    expect(chat).toContain('event.key === "Escape"');
    expect(chat).toContain('event.key !== "Tab"');
    expect(chat).toContain("returnFocusRef.current?.focus()");
    expect(chat).not.toMatch(/className=\{permissionStyles\.overlay\}[^>]*on(?:MouseDown|Click)=/);
  });

  it("uses approved desktop and mobile geometry without legacy colors", () => {
    expect(styles).toContain("width:min(448px,calc(100vw - 48px))");
    expect(styles).toContain("border-radius:26px");
    expect(styles).toContain("min-width:160px");
    expect(styles).toContain("min-width:132px");
    expect(styles).toContain("padding:18px 18px");
    expect(styles).toContain("border-radius:22px");
    expect(styles).toContain("height:48px");
    expect(styles).not.toContain("#1C1914");
    expect(styles).not.toContain("#34e6cf");
  });
});
