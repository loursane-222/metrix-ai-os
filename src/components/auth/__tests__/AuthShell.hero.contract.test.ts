import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/components/auth/AuthShell.tsx"), "utf8");

describe("AuthShell executive hero authority", () => {
  it("uses the same retina orb asset as ExecutivePresenceOrb", () => {
    expect(source).toContain('src="/design/executive-presence-orb.png"');
    expect(source).toContain('height="600"');
    expect(source).toContain('width="600"');
  });

  it("removes the CSS placeholder circle and keeps responsive dark presentation", () => {
    expect(source).not.toContain('className="h-24 w-24 rounded-full');
    expect(source).toContain("h-[clamp(150px,25vh,260px)]");
    expect(source).toContain("[color-scheme:dark]");
  });
});
