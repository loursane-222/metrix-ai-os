import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// Regression for the failed Git-source production build:
//   Module not found: Can't resolve '../generated/prisma/client'
// The generated Prisma client is gitignored, so a clean checkout only builds
// if `npm install` itself generates it — without needing a database.

const read = (path: string) => readFileSync(path, "utf8");

describe("clean-checkout build contract", () => {
  const pkg = JSON.parse(read("package.json"));

  it("npm install generates the Prisma client (native postinstall), so a clean checkout builds itself", () => {
    expect(pkg.scripts.postinstall).toBe("prisma generate");
    // The CLI that postinstall needs is installed with the project's dependencies.
    expect(pkg.devDependencies.prisma ?? pkg.dependencies.prisma).toBeTruthy();
  });

  it("the generated client is never committed — it is regenerated, not carried", () => {
    expect(read(".gitignore")).toMatch(/^src\/generated\/prisma\/$/m);
  });

  it("prisma generate needs no DATABASE_URL, but migrations still fail closed without one", () => {
    const config = read("prisma.config.ts");

    // The strict env() helper throws at config load, which would make
    // `prisma generate` (and so `npm ci`) fail on any machine without a DB URL.
    expect(config).not.toMatch(/\benv\(\s*["']DATABASE_URL["']\s*\)/);
    expect(config).toContain('process.env.DATABASE_URL ?? ""');
    // Nothing invents a fallback that could point at a real database.
    expect(config).not.toMatch(/postgres(ql)?:\/\//);
  });

  it("build and test scripts stay plain — no hidden generation or deployment side effects", () => {
    expect(pkg.scripts.build).toBe("next build");
    expect(pkg.scripts.test).toBe("vitest run");
  });
});

describe(".vercelignore — local artifacts never travel with a CLI deploy", () => {
  const lines = read(".vercelignore")
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"));

  it("excludes local secrets and tooling", () => {
    expect(lines).toContain(".env*");
    expect(lines).toContain(".claude/");
    expect(lines).toContain(".vercel/");
  });

  it("excludes the generated client so the remote build always regenerates it", () => {
    expect(lines).toContain("src/generated/");
  });

  it("never excludes source, migrations or the lockfile the build needs", () => {
    for (const needed of ["src", "prisma", "package.json", "package-lock.json", "prisma.config.ts", "next.config.ts"]) {
      expect(lines.some(line => line === needed || line === `${needed}/` || line === `/${needed}`)).toBe(false);
    }
  });
});
