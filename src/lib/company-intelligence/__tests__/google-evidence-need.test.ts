import { describe, expect, it } from "vitest";
import { detectGoogleEvidenceNeed } from "../google-evidence-need";

describe("detectGoogleEvidenceNeed", () => {
  it("A) email-only intent", () => {
    expect(detectGoogleEvidenceNeed("Son e-postalarımda önemli ne var?")).toEqual({ needsEmail: true, needsCalendar: false, calendarRangeDays: null });
  });

  it("B) calendar-only intent, bounded to today", () => {
    expect(detectGoogleEvidenceNeed("Bugün takvimimde ne var?")).toEqual({ needsEmail: false, needsCalendar: true, calendarRangeDays: 1 });
  });

  it("C) calendar-only intent, bounded to this/next week", () => {
    expect(detectGoogleEvidenceNeed("Önümüzdeki hafta önemli toplantılarım hangileri?")).toEqual({ needsEmail: false, needsCalendar: true, calendarRangeDays: 7 });
  });

  it("D) combined email + calendar intent", () => {
    const need = detectGoogleEvidenceNeed("Mail ve takvimime bak, bugün neye öncelik vermeliyim?");
    expect(need?.needsEmail).toBe(true);
    expect(need?.needsCalendar).toBe(true);
  });

  it("E) entity-linked combined intent — entity resolution itself is not this function's job", () => {
    const need = detectGoogleEvidenceNeed("Atlas ile ilgili son mail ve yaklaşan toplantı var mı?");
    expect(need?.needsEmail).toBe(true);
    expect(need?.needsCalendar).toBe(true);
  });

  it("is null when the message needs neither — connector is never called for an ordinary business turn", () => {
    expect(detectGoogleEvidenceNeed("Satış hedefimiz nasıl gidiyor?")).toBeNull();
    expect(detectGoogleEvidenceNeed("Atlas'ın kaydını açar mısın?")).toBeNull();
  });

  it("leaves calendarRangeDays null for an unbounded calendar request ('yaklaşan toplantılarım')", () => {
    const need = detectGoogleEvidenceNeed("Yaklaşan toplantılarım neler?");
    expect(need).toEqual({ needsEmail: false, needsCalendar: true, calendarRangeDays: null });
  });
});
