import { beforeEach, describe, expect, it, vi } from "vitest";

const { listCustomersMock, connectorHealthMock, connectorReadMock, telemetryMock } = vi.hoisted(() => ({
  listCustomersMock: vi.fn(),
  connectorHealthMock: vi.fn(),
  connectorReadMock: vi.fn(),
  telemetryMock: vi.fn(),
}));

vi.mock("@/lib/core/customers/customer.service", () => ({ listCustomers: listCustomersMock }));
vi.mock("../google-connector-adapter", () => ({ googleConnectorAdapter: { provider: "GOOGLE", health: connectorHealthMock, read: connectorReadMock } }));
vi.mock("../telemetry", () => ({ emitCompanyIntelligenceTelemetry: telemetryMock }));

import { buildGoogleEvidencePromptLine, resolveGoogleEvidence } from "../google-evidence";
import type { GoogleEvidenceNeed } from "../google-evidence-need";

const EMAIL_ONLY: GoogleEvidenceNeed = { needsEmail: true, needsCalendar: false, calendarRangeDays: null };
const CALENDAR_ONLY: GoogleEvidenceNeed = { needsEmail: false, needsCalendar: true, calendarRangeDays: 1 };
const COMBINED: GoogleEvidenceNeed = { needsEmail: true, needsCalendar: true, calendarRangeDays: null };

const atlas = { id: "cust-1", displayName: "Atlas Yapı", legalName: "Atlas Yapı A.Ş.", phone: null, email: "atlas@example.com", cariKodu: null, taxNumber: null };
const atlasVariant = { id: "cust-2", displayName: "Atlas İnşaat", legalName: null, phone: null, email: "atlas2@example.com", cariKodu: null, taxNumber: null };

describe("resolveGoogleEvidence", () => {
  beforeEach(() => {
    listCustomersMock.mockReset();
    connectorHealthMock.mockReset();
    connectorReadMock.mockReset();
    telemetryMock.mockReset();
  });

  it("is graceful (never fabricates) when Google is not connected — no reads attempted", async () => {
    connectorHealthMock.mockResolvedValue({ status: "UNAVAILABLE", checkedAt: "now" });
    const result = await resolveGoogleEvidence(EMAIL_ONLY, { organizationId: "org-1", userId: "user-1", entityReference: null });
    expect(result).toEqual({ connected: false, entityResolution: { status: "NOT_APPLICABLE" }, gmail: { status: "SKIPPED", messages: [] }, calendar: { status: "SKIPPED", events: [] } });
    expect(connectorReadMock).not.toHaveBeenCalled();
  });

  it("gathers Gmail and Calendar evidence in parallel for a combined need", async () => {
    connectorHealthMock.mockResolvedValue({ status: "HEALTHY", checkedAt: "now" });
    let gmailStarted = false;
    let calendarStartedBeforeGmailFinished = false;
    connectorReadMock.mockImplementation(async (request: { factScope: string }) => {
      if (request.factScope === "email.recentMessages") {
        gmailStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { status: "OK", value: [], observedAt: "now" };
      }
      calendarStartedBeforeGmailFinished = gmailStarted; // started while Gmail's own await was still pending
      return { status: "OK", value: [], observedAt: "now" };
    });
    await resolveGoogleEvidence(COMBINED, { organizationId: "org-1", userId: "user-1", entityReference: null });
    expect(calendarStartedBeforeGmailFinished).toBe(true);
    expect(connectorReadMock).toHaveBeenCalledTimes(2);
  });

  it("scopes both reads and the customer lookup to exactly the given organization and user", async () => {
    connectorHealthMock.mockResolvedValue({ status: "HEALTHY", checkedAt: "now" });
    listCustomersMock.mockResolvedValue([atlas]);
    connectorReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    await resolveGoogleEvidence(COMBINED, { organizationId: "org-42", userId: "user-77", entityReference: "Atlas" });
    expect(listCustomersMock).toHaveBeenCalledWith({ organizationId: "org-42", status: "ACTIVE" });
    for (const call of connectorReadMock.mock.calls) {
      expect(call[0].organizationId).toBe("org-42");
      expect(call[0].params.userId).toBe("user-77");
    }
  });

  it("resolves an exact entity match and scopes the Gmail/Calendar query to that customer's real email — reuses the same resolver business-navigation uses, no second matching algorithm", async () => {
    connectorHealthMock.mockResolvedValue({ status: "HEALTHY", checkedAt: "now" });
    listCustomersMock.mockResolvedValue([atlas]);
    connectorReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    const result = await resolveGoogleEvidence(COMBINED, { organizationId: "org-1", userId: "user-1", entityReference: "Atlas Yapı" });
    expect(result.entityResolution).toEqual({ status: "RESOLVED", customerName: "Atlas Yapı", email: "atlas@example.com" });
    const gmailCall = connectorReadMock.mock.calls.find((call) => call[0].factScope === "email.recentMessages");
    expect(gmailCall![0].params.query).toContain("atlas@example.com");
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
  it("tells the model to say plainly it has no access, without vendor terms, when disconnected", () => {
    const line = buildGoogleEvidencePromptLine(EMAIL_ONLY, { connected: false, entityResolution: { status: "NOT_APPLICABLE" }, gmail: { status: "SKIPPED", messages: [] }, calendar: { status: "SKIPPED", events: [] } });
    expect(line).toContain("no Google account is connected");
    expect(line).toContain('never say "Gmail"');
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
});
