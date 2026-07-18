import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_ROOTS = [join(ROOT, "src/lib"), join(ROOT, "src/app/api")];
const ALLOWED_REPOSITORIES = new Set([
  "src/lib/core/memory-items/memory-item.repository.ts",
  "src/lib/core/memory-candidates/memory-candidate.repository.ts",
  "src/lib/executive-decision-loop/executive-decision-record.repository.ts",
]);
const CANONICAL_MUTATION = /\b(?:prisma|tx|client)\.(?:memoryItem|memoryCandidate|executiveDecisionRecord|executiveDecisionOutcome)\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g;

describe("canonical persistence architectural boundary", () => {
  it("keeps direct canonical Prisma mutations inside authorized repositories", () => {
    const violations: string[] = [];
    for (const file of SCAN_ROOTS.flatMap(listTypeScriptFiles)) {
      const repositoryPath = relative(ROOT, file);
      if (ALLOWED_REPOSITORIES.has(repositoryPath)) continue;
      const source = readFileSync(file, "utf8");
      if (CANONICAL_MUTATION.test(source)) violations.push(repositoryPath);
      CANONICAL_MUTATION.lastIndex = 0;
    }
    expect(violations).toEqual([]);
  });

  it("limits transition capability factories to their domain services", () => {
    const allowedFactoryConsumers: Record<string, Set<string>> = {
      authorizeMemoryItemTransition: new Set([
        "src/lib/core/memory-items/memory-item.service.ts",
        "src/lib/memory/memory-promotion.service.ts",
      ]),
      authorizeMemoryCandidateTransition: new Set([
        "src/lib/core/memory-candidates/memory-candidate.service.ts",
        "src/lib/memory/candidate-engine.service.ts",
        "src/lib/memory/memory-promotion.service.ts",
      ]),
      authorizeExecutiveDecisionRecordTransition: new Set([
        "src/lib/executive-decision-loop/executive-decision-record.service.ts",
        "src/lib/executive-decision-loop/executive-decision-outcome.service.ts",
      ]),
    };
    const violations: string[] = [];
    for (const file of SCAN_ROOTS.flatMap(listTypeScriptFiles)) {
      const repositoryPath = relative(ROOT, file);
      if (repositoryPath.endsWith("-transition-authorization.ts")) continue;
      const source = readFileSync(file, "utf8");
      for (const [factory, allowed] of Object.entries(allowedFactoryConsumers)) {
        if (source.includes(factory) && !allowed.has(repositoryPath)) {
          violations.push(`${repositoryPath}:${factory}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : listTypeScriptFiles(path);
    }
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}
