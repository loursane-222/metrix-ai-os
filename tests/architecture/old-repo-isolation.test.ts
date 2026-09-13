import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const productionRoot = join(process.cwd(), "src");
const routePath = join(productionRoot, "app/api/metrix/route.ts");

const forbidden = [
  "/Users/mac/Projects/metrix-ai-os",
  "metrix-ai-os/",
  "../metrix-ai-os"
];

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);

    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(ts|tsx)$/.test(name)
        ? [path]
        : [];
  });
}

describe("METRIX Next architecture isolation", () => {
  it("has its own METRIX transport route", () => {
    expect(existsSync(routePath)).toBe(true);
  });

  it("contains no runtime reference to the old repository", () => {
    for (const file of sourceFiles(productionRoot)) {
      const source = readFileSync(file, "utf8");

      for (const marker of forbidden) {
        expect(source, `${file} contains ${marker}`).not.toContain(marker);
      }
    }
  });
});
