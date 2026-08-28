import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const shell = readFileSync(resolve(process.cwd(), "src/components/auth/AuthShell.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/components/auth/EntryPresentation.module.css"), "utf8");
describe("approved auth entry presentation contract", () => {
  it("uses the approved restrained presence and navy glass shell", () => {
    expect(shell).toContain("<Presence />");
    expect(styles).toContain("width:520px");
    expect(styles).toContain("border-radius:28px");
    expect(styles).toContain("padding:43px 46px 34px");
  });
  it("removes the legacy auth hero and bright turquoise grammar", () => {
    expect(shell).not.toContain("AI EXECUTIVE OS");
    expect(shell).not.toContain("executive-presence-orb.png");
    expect(shell).not.toContain("Güvenli giriş");
    expect(styles).not.toContain("#34e6cf");
  });
  it("keeps exact mobile geometry and readable form sizing", () => {
    expect(styles).toContain("left:18px;width:calc(100% - 36px)");
    expect(styles).toContain("padding:34px 24px 25px");
    expect(styles).toContain("font-size:16px");
  });
});
