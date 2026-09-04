import { beforeEach, describe, expect, it, vi } from "vitest";

const { listCustomersMock, connectorHealthMock, connectorReadMock, projectionMock, telemetryMock } = vi.hoisted(() => ({
  listCustomersMock: vi.fn(),
  connectorHealthMock: vi.fn(),
  connectorReadMock: vi.fn(),
  projectionMock: vi.fn(),
  telemetryMock: vi.fn(),
}));

vi.mock("@/lib/core/customers/customer.service", () => ({ listCustomers: listCustomersMock }));
vi.mock("../google-connector-adapter", () => ({ googleConnectorAdapter: { provider: "GOOGLE", health: connectorHealthMock, read: connectorReadMock } }));
vi.mock("../calendar-projection", () => ({ resolveCanonicalCalendarProjection: projectionMock }));
vi.mock("../telemetry", () => ({ emitCompanyIntelligenceTelemetry: telemetryMock }));

import { buildGoogleEvidencePromptLine, resolveGoogleEvidence } from "../google-evidence";
import type { GoogleEvidenceNeed } from "../google-evidence-need";

const EMAIL_ONLY: GoogleEvidenceNeed = { needsEmail: true, needsCalendar: false, calendarRangeDays: null };
const CALENDAR_ONLY: GoogleEvidenceNeed = { needsEmail: false, needsCalendar: true, calendarRangeDays: 1 };
const COMBINED: GoogleEvidenceNeed = { needsEmail: true, needsCalendar: true, calendarRangeDays: null };

const atlas = { id: "cust-1", displayName: "Atlas Yapı", legalName: "Atlas Yapı A.Ş.", phone: null, email: "atlas@example.com", cariKodu: null, taxNumber: null };
const atlasVariant = { id: "cust-2", displayName: "Atlas İnşaat", legalName: null, phone: null, email: "atlas2@example.com", cariKodu: null, taxNumber: null };
const emptyProjection = { nativeEvents: [], googleEvents: [], sourceStatuses: { METRIX_NATIVE: "OK", GOOGLE: "OK" } };

describe("resolveGoogleEvidence", () => {
  beforeEach(() => {
    listCustomersMock.mockReset();
    connectorHealthMock.mockReset();
    connectorReadMock.mockReset();
    projectionMock.mockReset().mockResolvedValue(emptyProjection);
    telemetryMock.mockReset();
  });

  it("is graceful (never fabricates) for email when Google is not connected — no Gmail read attempted", async () => {
    connectorHealthMock.mockResolvedValue({ status: "UNAVAILABLE", checkedAt: "now" });
    const result = await resolveGoogleEvidence(EMAIL_ONLY, { organizationId: "org-1", userId: "user-1", entityReference: null });
    expect(result).toEqual({ connected: false, entityResolution: { status: "NOT_APPLICABLE" }, gmail: { status: "UNAVAILABLE", messages: [] }, calendar: { status: "SKIPPED", events: [] } });
    expect(connectorReadMock).not.toHaveBeenCalled();
  });

  it("still resolves real native calendar evidence when Google is not connected — calendar is federated, not Google-only", async () => {
    connectorHealthMock.mockResolvedValue({ status: "UNAVAILABLE", checkedAt: "now" });
    projectionMock.mockResolvedValue({ nativeEvents: [{ id: "n1", title: "Native görüşme", startAt: "2026-09-04T09:00:00.000Z", endAt: "2026-09-04T09:30:00.000Z" }], googleEvents: [], sourceStatuses: { METRIX_NATIVE: "OK", GOOGLE: "UNAVAILABLE" } });
    const result = await resolveGoogleEvidence(CALENDAR_ONLY, { organizationId: "org-1", userId: "user-1", entityReference: null });
    expect(result.calendar.status).toBe("OK");
    expect(result.calendar.events).toEqual([{ title: "Native görüşme", startAt: "2026-09-04T09:00:00.000Z", endAt: "2026-09-04T09:30:00.000Z", attendees: [] }]);
  });

  it("gathers Gmail and Calendar evidence in parallel for a combined need", async () => {
    connectorHealthMock.mockResolvedValue({ status: "HEALTHY", checkedAt: "now" });
    connectorReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    let gmailStarted = false;
    let calendarStartedBeforeGmailFinished = false;
    connectorReadMock.mockImplementation(async () => {
      gmailStarted = true;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { status: "OK", value: [], observedAt: "now" };
    });
    projectionMock.mockImplementation(async () => {
      calendarStartedBeforeGmailFinished = gmailStarted;
      return emptyProjection;
    });
    await resolveGoogleEvidence(COMBINED, { organizationId: "org-1", userId: "user-1", entityReference: null });
    expect(calendarStartedBeforeGmailFinished).toBe(true);
    expect(connectorReadMock).toHaveBeenCalledTimes(1);
    expect(projectionMock).toHaveBeenCalledTimes(1);
  });

  it("scopes the Gmail read and the projection call to exactly the given organization and user", async () => {
    connectorHealthMock.mockResolvedValue({ status: "HEALTHY", checkedAt: "now" });
    listCustomersMock.mockResolvedValue([atlas]);
    connectorReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    await resolveGoogleEvidence(COMBINED, { organizationId: "org-42", userId: "user-77", entityReference: "Atlas" });
    expect(listCustomersMock).toHaveBeenCalledWith({ organizationId: "org-42", status: "ACTIVE" });
    expect(connectorReadMock.mock.calls[0][0]).toMatchObject({ organizationId: "org-42", params: { userId: "user-77" } });
    expect(projectionMock.mock.calls[0][0]).toMatchObject({ organizationId: "org-42", userId: "user-77" });
  });

  it("resolves an exact entity match and scopes the Gmail query to that customer's real email — reuses the same resolver business-navigation uses, no second matching algorithm", async () => {
    connectorHealthMock.mockResolvedValue({ status: "HEALTHY", checkedAt: "now" });
    listCustomersMock.mockResolvedValue([atlas]);
    connectorReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    const result = await resolveGoogleEvidence(COMBINED, { organizationId: "org-1", userId: "user-1", entityReference: "Atlas Yapı" });
    expect(result.entityResolution).toEqual({ status: "RESOLVED", customerName: "Atlas Yapı", email: "atlas@example.com" });
    expect(connectorReadMock.mock.calls[0][0].params.query).toContain("atlas@example.com");
    expect(projectionMock.mock.calls[0][0].query).toBe("atlas@example.com");
  });

  it("is AMBIGUOUS (never guesses) when more than one customer matches the mentioned name", async () => {
    connectorHealthMock.mockResolvedValue({ status: "HEALTHY", checkedAt: "now" });
    listCustomersMock.mockResolvedValue([atlas, atlasVariant]);
    connectorReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    const result = await resolveGoogleEvidence(EMAIL_ONLY, { organizationId: "org-1", userId: "user-1", entityReference: "Atlas" });
    expect(result.entityResolution.status).toBe("AMBIGUOUS");
  });

  it("is NOT_FOUND (never fabricates a customer) when no record matches the mentioned name", async () => {
    connectorHealthMock.mockResolvedValue({ status: "HEALTHY", checkedAt: "now" });
    listCustomersMock.mockResolvedValue([]);
    connectorReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    const result = await resolveGoogleEvidence(EMAIL_ONLY, { organizationId: "org-1", userId: "user-1", entityReference: "Nonexistent Corp" });
    expect(result.entityResolution.status).toBe("NOT_FOUND");
  });

  it("skips entity resolution entirely when no entity is mentioned", async () => {
    connectorHealthMock.mockResolvedValue({ status: "HEALTHY", checkedAt: "now" });
    connectorReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    const result = await resolveGoogleEvidence(CALENDAR_ONLY, { organizationId: "org-1", userId: "user-1", entityReference: null });
    expect(result.entityResolution).toEqual({ status: "NOT_APPLICABLE" });
    expect(listCustomersMock).not.toHaveBeenCalled();
  });

  it("compacts Gmail evidence — never includes the full message body", async () => {
    connectorHealthMock.mockResolvedValue({ status: "HEALTHY", checkedAt: "now" });
    connectorReadMock.mockResolvedValue({ status: "OK", value: [{ provider: "gmail", messageId: "m1", threadId: "t1", sender: "a@b.com", subject: "Konu", receivedAt: "now", snippet: "kısa özet", body: "ÇOK UZUN VE HASSAS TAM İÇERİK" }], observedAt: "now" });
    const result = await resolveGoogleEvidence(EMAIL_ONLY, { organizationId: "org-1", userId: "user-1", entityReference: null });
    expect(result.gmail.messages[0]).toEqual({ sender: "a@b.com", subject: "Konu", receivedAt: "now", snippet: "kısa özet" });
    expect(JSON.stringify(result.gmail.messages)).not.toContain("HASSAS TAM İÇERİK");
  });

  it("I) compact calendar evidence never carries a provider tag — Executive Brain cannot tell which source an event came from", async () => {
    connectorHealthMock.mockResolvedValue({ status: "HEALTHY", checkedAt: "now" });
    projectionMock.mockResolvedValue({
      nativeEvents: [{ id: "n1", title: "Native görüşme", startAt: "2026-09-04T09:00:00.000Z", endAt: "2026-09-04T09:30:00.000Z" }],
      googleEvents: [{ canonicalEventId: "google:evt-1", provider: "GOOGLE", sourceEventId: "evt-1", title: "Metrix test", description: null, startAt: "2026-09-04T18:30:00.000Z", endAt: "2026-09-04T19:30:00.000Z", allDay: false, attendees: [], status: "CONFIRMED", htmlLink: null }],
      sourceStatuses: { METRIX_NATIVE: "OK", GOOGLE: "OK" },
    });
    const result = await resolveGoogleEvidence(CALENDAR_ONLY, { organizationId: "org-1", userId: "user-1", entityReference: null });
    for (const event of result.calendar.events) {
      expect(Object.keys(event).sort()).toEqual(["attendees", "endAt", "startAt", "title"]);
    }
  });

  it("never logs sensitive email/calendar content — telemetry carries only counts and statuses", async () => {
    connectorHealthMock.mockResolvedValue({ status: "HEALTHY", checkedAt: "now" });
    connectorReadMock.mockResolvedValue({ status: "OK", value: [{ provider: "gmail", messageId: "m1", subject: "Gizli Sözleşme Detayları", sender: "ceo@atlas.com", snippet: "Bu bilgiyi kimseyle paylaşma", receivedAt: "now" }], observedAt: "now" });
    await resolveGoogleEvidence(EMAIL_ONLY, { organizationId: "org-1", userId: "user-1", entityReference: null });
    expect(telemetryMock).toHaveBeenCalled();
    const loggedPayload = JSON.stringify(telemetryMock.mock.calls);
    expect(loggedPayload).not.toContain("Gizli Sözleşme");
    expect(loggedPayload).not.toContain("ceo@atlas.com");
    expect(loggedPayload).not.toContain("kimseyle paylaşma");
  });
});

describe("buildGoogleEvidencePromptLine", () => {
  it("tells the model to say plainly it has no email access, without vendor terms, when disconnected", () => {
    const line = buildGoogleEvidencePromptLine(EMAIL_ONLY, { connected: false, entityResolution: { status: "NOT_APPLICABLE" }, gmail: { status: "UNAVAILABLE", messages: [] }, calendar: { status: "SKIPPED", events: [] } });
    expect(line).toContain("no Google account is connected");
    expect(line).toContain('never say "Gmail"');
  });

  it("still narrates real native calendar evidence when Google is disconnected — never a blanket 'no access' for calendar", () => {
    const line = buildGoogleEvidencePromptLine(CALENDAR_ONLY, { connected: false, entityResolution: { status: "NOT_APPLICABLE" }, gmail: { status: "SKIPPED", messages: [] }, calendar: { status: "OK", events: [{ title: "Native görüşme", startAt: "now", endAt: "now", attendees: [] }] } });
    expect(line).toContain("Native görüşme");
    expect(line).not.toContain("no Google account is connected");
  });

  it("instructs ask-which-one for AMBIGUOUS entity resolution", () => {
    const line = buildGoogleEvidencePromptLine(EMAIL_ONLY, { connected: true, entityResolution: { status: "AMBIGUOUS", candidateNames: ["Atlas Yapı", "Atlas İnşaat"] }, gmail: { status: "OK", messages: [] }, calendar: { status: "SKIPPED", events: [] } });
    expect(line).toContain("Atlas Yapı, Atlas İnşaat");
    expect(line).toMatch(/never guess/i);
  });

  it("instructs executive synthesis (not just listing) only when both Gmail and Calendar evidence are genuinely present", () => {
    const combinedLine = buildGoogleEvidencePromptLine(COMBINED, { connected: true, entityResolution: { status: "NOT_APPLICABLE" }, gmail: { status: "OK", messages: [] }, calendar: { status: "OK", events: [] } });
    expect(combinedLine).toMatch(/executive judgment/i);
    const emailOnlyLine = buildGoogleEvidencePromptLine(EMAIL_ONLY, { connected: true, entityResolution: { status: "NOT_APPLICABLE" }, gmail: { status: "OK", messages: [] }, calendar: { status: "SKIPPED", events: [] } });
    expect(emailOnlyLine).not.toMatch(/executive judgment/i);
  });

  it("never claims fabricated success when a real read failed", () => {
    const line = buildGoogleEvidencePromptLine(EMAIL_ONLY, { connected: true, entityResolution: { status: "NOT_APPLICABLE" }, gmail: { status: "UNAVAILABLE", messages: [] }, calendar: { status: "SKIPPED", events: [] } });
    expect(line).toMatch(/couldn't check email/i);
    expect(line).toMatch(/never invent/i);
  });

  it("H) never claims fabricated success when calendar retrieval fully failed (both sources down)", () => {
    const line = buildGoogleEvidencePromptLine(CALENDAR_ONLY, { connected: true, entityResolution: { status: "NOT_APPLICABLE" }, gmail: { status: "SKIPPED", messages: [] }, calendar: { status: "UNAVAILABLE", events: [] } });
    expect(line).toMatch(/couldn't check the calendar/i);
    expect(line).toMatch(/never invent/i);
  });
});
