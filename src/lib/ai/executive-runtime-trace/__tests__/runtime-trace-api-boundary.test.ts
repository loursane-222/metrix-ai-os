import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../../app/api/executive/runtime-traces/route.ts",
  ),
  "utf8",
);

describe("authenticated redacted runtime trace query", () => {
  it("enforces organization scope and returns only persisted redacted records", () => {
    expect(source).toContain("requireAuthContextFromCookies");
    expect(source).toContain("organizationId: auth.organization.id");
    expect(source).toContain("redactionVersion: true");
    expect(source).toContain("traceJson: true");
    expect(source).not.toContain("message.content");
  });
});
