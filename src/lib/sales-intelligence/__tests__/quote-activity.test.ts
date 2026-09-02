import { describe, expect, it, vi } from "vitest";
import type { ManagementIntent } from "@/lib/conversation-understanding";
import { buildQuoteActivityDataset, buildQuoteActivityPromptLine, buildQuoteActivityResponse } from "../quote-activity";

type Intent = Extract<ManagementIntent, { intent: "QUOTE_ACTIVITY" }>;
const now = new Date("2026-09-15T09:00:00.000Z");
const intent = (activity: Intent["activity"], countMode: Intent["countMode"] = "DISTINCT_QUOTES"): Intent => ({ intent: "QUOTE_ACTIVITY", activity, countMode, period: "CURRENT_MONTH" });
const reader = (eventRows: readonly { quoteId: string }[] = [], quoteCount = 0) => ({ quote: { count: vi.fn().mockResolvedValue(quoteCount) }, quoteEvent: { findMany: vi.fn().mockResolvedValue(eventRows) } });

describe("canonical quote activity", () => {
  it.each([["CREATED", "createdAt"], ["ACCEPTED", "wonAt"], ["REJECTED", "lostAt"]] as const)("uses canonical %s timestamp with tenant-scoped half-open boundaries", async (activity, field) => {
    const db = reader([], 3);
    const dataset = await buildQuoteActivityDataset("org-1", { intent: intent(activity), now, timeZone: "Europe/Istanbul" }, db);
    expect(dataset.count).toBe(3);
    expect(db.quote.count).toHaveBeenCalledWith({ where: { organizationId: "org-1", [field]: { gte: new Date("2026-08-31T21:00:00.000Z"), lt: now } } });
    expect(JSON.stringify(db.quote.count.mock.calls)).not.toMatch(/updatedAt|status/u);
  });

  it.each([["SENT", "QUOTE_SENT"], ["VIEWED", "QUOTE_VIEWED"]] as const)("separates distinct quotes from repeated %s events and reads the complete set", async (activity, eventType) => {
    const rows = [{ quoteId: "q1" }, { quoteId: "q1" }, { quoteId: "q2" }];
    const db = reader(rows);
    const distinct = await buildQuoteActivityDataset("org-1", { intent: intent(activity), now, timeZone: "Europe/Istanbul" }, db);
    const events = await buildQuoteActivityDataset("org-1", { intent: intent(activity, "EVENTS"), now, timeZone: "Europe/Istanbul" }, reader(rows));
    expect(distinct.count).toBe(2);
    expect(events.count).toBe(3);
    expect(db.quoteEvent.findMany).toHaveBeenCalledWith({ where: { organizationId: "org-1", eventType, createdAt: { gte: new Date("2026-08-31T21:00:00.000Z"), lt: now } }, select: { quoteId: true } });
    expect(JSON.stringify(db.quoteEvent.findMany.mock.calls)).not.toContain("take");
  });

  it("represents known zero affirmatively without mutable monetary history", async () => {
    const dataset = await buildQuoteActivityDataset("org-zero", { intent: intent("CREATED"), now, timeZone: "Europe/Istanbul" }, reader([], 0));
    expect(buildQuoteActivityResponse(dataset)).toBe("Eylül 2026 döneminde oluşturulan teklif bulunmuyor.");
    expect(buildQuoteActivityPromptLine(dataset)).toContain("count-only; not sales/revenue/order/collection/cash");
    expect(JSON.stringify(dataset)).not.toMatch(/amount|currency|invoice|settlement|payment/iu);
  });

  it("produces identical datasets and narration for repeated evidence", async () => {
    const build = () => buildQuoteActivityDataset("org-1", { intent: intent("VIEWED", "EVENTS"), now, timeZone: "Europe/Istanbul" }, reader([{ quoteId: "q1" }, { quoteId: "q1" }]));
    const first = await build(); const second = await build();
    expect(first).toEqual(second);
    expect(buildQuoteActivityResponse(first)).toBe(buildQuoteActivityResponse(second));
  });
});
