import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("business-light context contract", () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      "src/lib/ai/gateway/business-light-context.service.ts",
    ),
    "utf8",
  );

  it("keeps the lookup tenant-scoped and bounded", () => {
    expect(source).toContain(
      "where: { organizationId: input.organizationId }",
    );
    expect(source).toContain("take: MAX_CANDIDATES");
    expect(source).toContain(".slice(0, MAX_MATCHES)");
  });

  it("only includes customer records named in the current message", () => {
    expect(source).toContain("normalizedMessage.includes(name)");
    expect(source).toContain('"Relevant customer records:"');
  });
});
