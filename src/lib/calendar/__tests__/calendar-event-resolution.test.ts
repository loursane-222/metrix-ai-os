import { describe, expect, it } from "vitest";
import { resolveCalendarEventReference } from "../calendar-event-resolution";
describe("calendar event resolution", () => { const events = [{ id: "1", title: "Haftalık Toplantı" }, { id: "2", title: "Satış Toplantısı" }]; it("prefers exact then containment", () => { expect(resolveCalendarEventReference(events, "haftalik toplanti")).toMatchObject({ status: "RESOLVED", event: { id: "1" } }); }); it("does not invent an event", () => { expect(resolveCalendarEventReference(events, "yıllık plan")).toEqual({ status: "NOT_FOUND" }); }); });
