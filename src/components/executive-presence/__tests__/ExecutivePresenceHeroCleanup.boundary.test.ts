import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function path(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

describe("METRIX hero cleanup boundary", () => {
  it("removes customer hero code and hero-wing assets", () => {
    expect(existsSync(path("../../customers/CustomersHero.tsx"))).toBe(false);
    expect(existsSync(path("../../../../public/design/hero-wings.svg"))).toBe(false);
    expect(existsSync(path("../../../../design-system/global/hero-wings.svg"))).toBe(false);
  });

  it("records the production no-hero authority", () => {
    const authority = readFileSync(
      path("../../../../.claude/DESIGN_SYSTEM_AUTHORITY.md"),
      "utf8",
    );
    expect(authority).toContain("METRIX production sayfalarında hero kullanılmaz.");
    expect(authority).not.toContain("HeroSection");
  });
});
