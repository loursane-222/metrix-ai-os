import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("main conversation fade ownership", () => {
  const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const chat = readFileSync(resolve(process.cwd(), "src/components/metrix-tab/MetrixChatTab.tsx"), "utf8");
  const summary = readFileSync(resolve(process.cwd(), "src/components/metrix-tab/DailyExecutiveSummaryV2.tsx"), "utf8");

  it("keeps the progressive orb fade on transcript-only main states", () => {
    expect(css).toContain(".metrix-main-conversation:not(:has([data-daily-executive-summary-v2]))");
    expect(css).toContain("transparent 160px,#000 520px");
    expect(chat).toContain('className="metrix-main-conversation');
  });

  it("excludes Daily Summary and every workspace branch from the mask owner", () => {
    expect(summary).toContain("data-daily-executive-summary-v2");
    expect(chat).toContain('className={`metrix-workspace-conversation');
    expect(css).not.toMatch(/\.metrix-workspace-conversation[^{}]*mask-image/);
    expect(css).not.toMatch(/\.workspace-surface[^{}]*mask-image/);
    expect(css).not.toMatch(/\.metrix-main-composer[^{}]*mask-image/);
  });
});
