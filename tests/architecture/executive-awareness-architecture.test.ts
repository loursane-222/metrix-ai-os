import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

// The guards are about what the code DOES; comments that explain what it
// deliberately does not do must not trip them.
const code = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const awarenessDir = "src/lib/awareness";
const awarenessSources = readdirSync(awarenessDir).map(file => ({
  file,
  source: code(join(awarenessDir, file))
}));

describe("Executive Awareness architecture guardrails", () => {
  it("there is no second agent, no second model owner and no custom semantic layer", () => {
    const all = [
      ...awarenessSources.map(item => item.source),
      code("src/app/api/internal/awareness/sweep/route.ts")
    ].join("\n");

    expect(all).not.toMatch(/new Agent\b|from ["']@openai\/agents["']|from ["']openai["']/);
    expect(all).not.toMatch(/gpt-|responses\.create|chat\.completions/);
    expect(all).not.toMatch(
      /classif|semanticRouter|conversationRouter|planner|intentClassifier|narrat|significance|importance|urgent|risk\s*score/i
    );

    // The one agent still lives in one file.
    expect((read("src/lib/agent/metrix-executive-agent.ts").match(/new Agent/g) ?? []).length).toBe(1);
  });

  it("the sweep reaches the Executive only through the existing runMetrixExecutiveTurn, as a SYSTEM_EVENT", () => {
    const sweep = code(join(awarenessDir, "awareness-sweep.ts"));

    expect(sweep).toContain('from "../agent/metrix-executive-agent"');
    expect(sweep).toContain("runMetrixExecutiveTurn");
    expect(sweep).toContain('origin: "SYSTEM_EVENT"');
  });

  it("awareness never writes a notification or any business record itself — the Executive's own tool does", () => {
    for (const { source } of awarenessSources) {
      expect(source).not.toMatch(/executeNotificationCreate|notification\.create\(|db\.notification/);
      expect(source).not.toMatch(/db\.(task|customer|quote|order|invoice|calendarEvent)\.(create|update|delete)/);
    }
  });

  it("no request can claim to be a system event: the public turn schema has no origin", () => {
    const route = read("src/app/api/metrix/route.ts");

    expect(route).not.toContain("SYSTEM_EVENT");
    expect(route).not.toMatch(/origin/);
    expect(read("src/lib/live/live-delegation-bridge.ts")).not.toContain("SYSTEM_EVENT");
  });

  it("the existing reminder sweep route is untouched and stays separate from awareness", () => {
    const reminder = read("src/app/api/internal/reminders/sweep/route.ts");

    expect(reminder).toContain("runReminderSweep");
    expect(reminder).not.toMatch(/awareness/i);
  });

  it("the notification toast still delivers by polling and keeps its once-only sound state", () => {
    const toast = read("src/components/living-workspace/MetrixNotificationToast.tsx");

    expect(toast).toContain("POLL_INTERVAL_MS");
    expect(toast).not.toContain("EventSource");
  });
});
