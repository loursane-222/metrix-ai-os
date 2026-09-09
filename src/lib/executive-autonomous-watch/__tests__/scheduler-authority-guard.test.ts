// Final consolidation pass §4-5: a scheduled (cron-invoked, no user action
// in the loop) watcher/reminder must not independently decide that a
// business situation deserves proactive Executive notification. This is a
// semantic guard, not a filename check — it scans every known scheduler
// module for a direct notify()/notifyWithOwnerFanout() call and requires
// any such call to be explicitly justified as MECHANICAL (a deterministic,
// single-entity fact — a due date, a meeting time — with no cross-entity
// risk/opportunity diagnosis and no recipient beyond who the mechanical
// event is actually about). Anything else must route through canonical
// Executive Awareness (this directory's own -delivery.service.ts, called
// only after runAwarenessJudgment).
//
// Deliberately scoped to the known scheduler directories (Grand
// Consolidation discovery), not the whole repo: the ~70 notify() call
// sites under src/lib/action-runtime/** are user-action activity
// notifications ("you just created X"), a different semantic family this
// rule does not govern — scanning them would make this guard meaningless
// noise, not a boundary.
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const NOTIFY_CALL = /\bnotify\(|\bnotifyWithOwnerFanout\(/;

// path (relative to repo root) -> why a direct proactive notification from
// a scheduler is acceptable without passing through Executive judgment.
const MECHANICAL_ALLOWLIST = new Map<string, string>([
  [
    "src/lib/core/calendar/financial-reminder-scheduler.service.ts",
    "Single-obligation due-date reminder: title/body are the calendar fact itself (amount, due date), no cross-entity risk diagnosis or recommendation.",
  ],
  [
    "src/lib/core/calendar/calendar-meeting-reminder.service.ts",
    "Single-meeting time reminder to its actual participants, no business judgment.",
  ],
  [
    "src/lib/rep-goals/rep-morning-briefing-runner.service.ts",
    "Personal productivity nudge to the individual rep about their own goal progress — recipient is the rep, not OWNER/EXECUTIVE, and content is not company-level Executive judgment (out of Executive Awareness's semantic scope by definition).",
  ],
  [
    "src/lib/executive-autonomous-watch/executive-autonomous-watch-delivery.service.ts",
    "The canonical Stage 2 delivery adapter — the only path allowed to deliver a company-level Executive judgment, and only after runAwarenessJudgment + lifecycle persistence decided INTERVENE.",
  ],
]);

// Directories known to contain scheduler/watcher entry points (cron- or
// GitHub-Actions-invoked, no user action). Growing this list is the
// intended way to bring a new scheduler under this guard.
const SCHEDULER_DIRS = [
  "src/lib/core/calendar",
  "src/lib/rep-goals",
  "src/lib/daily-briefing",
  "src/lib/executive-autonomous-watch",
  "src/lib/executive-alerts",
];

function collectTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : collectTsFiles(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

describe("Scheduler single-authority guard (semantic, not filename-brittle)", () => {
  it("every scheduler-directory file that calls notify()/notifyWithOwnerFanout() directly is on the reviewed MECHANICAL allowlist", () => {
    const unexplained: string[] = [];

    for (const dir of SCHEDULER_DIRS) {
      for (const file of collectTsFiles(resolve(ROOT, dir))) {
        const relative = file.slice(ROOT.length + 1).split("\\").join("/");
        const source = readFileSync(file, "utf8");
        if (!NOTIFY_CALL.test(source)) continue;
        if (!MECHANICAL_ALLOWLIST.has(relative)) unexplained.push(relative);
      }
    }

    expect(
      unexplained,
      `These scheduler files call notify()/notifyWithOwnerFanout() directly without a reviewed MECHANICAL justification. Either they are genuinely mechanical (add them to MECHANICAL_ALLOWLIST with why), or they must route their business-state evaluation through canonical Executive Awareness (runAwarenessJudgment) instead of notifying directly:\n${unexplained.join("\n")}`,
    ).toEqual([]);
  });

  it("the daily briefing scheduler remains a pull surface — it must not start pushing its own proactive notification", () => {
    const file = resolve(ROOT, "src/lib/daily-briefing/daily-briefing-orchestrator.service.ts");
    const source = readFileSync(file, "utf8");
    expect(NOTIFY_CALL.test(source), "daily-briefing-orchestrator.service.ts must not call notify() directly — see final consolidation §4C").toBe(false);
  });

  it("every allowlisted path actually exists and still contains a notify call (catches a stale/renamed entry)", () => {
    for (const [path] of MECHANICAL_ALLOWLIST) {
      const source = readFileSync(resolve(ROOT, path), "utf8");
      expect(NOTIFY_CALL.test(source), `${path} is allowlisted but no longer calls notify()/notifyWithOwnerFanout() — remove the stale entry`).toBe(true);
    }
  });
});
