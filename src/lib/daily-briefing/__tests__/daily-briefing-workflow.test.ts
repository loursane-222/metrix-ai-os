import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Daily Briefing workflow", () => {
  const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/daily-briefing.yml"), "utf8");

  it("keeps the production schedule and sends only isWeeklyDay", () => {
    expect(workflow).toContain("cron: '0 4 * * *'");
    expect(workflow).toContain('--data "{\\"isWeeklyDay\\":');
    expect(workflow).toContain("--fail-with-body");
    expect(workflow).toContain("CURL_EXIT=$?");
    expect(workflow).toContain('exit "$CURL_EXIT"');
  });

  it("does not use organization or company-context secrets", () => {
    expect(workflow).not.toContain("METRIX_ORG_ID");
    expect(workflow).not.toContain("METRIX_COMPANY_CONTEXT");
    expect(workflow).not.toContain("organizationId");
    expect(workflow).not.toContain("companyContext");
  });
});
