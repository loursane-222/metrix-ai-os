import { describe, expect, it, vi } from "vitest";

// Residual Capability Parity Migration: the SEND_WHATSAPP branch this file
// used to test directly is retired from offer-management-conversation-
// extension.ts — the client-only half (window.open) moved to a new
// compose_offer_whatsapp Agent tool (see
// residual-capability-tools.test.ts for its coverage), and the quote/
// customer resolution it depends on moved to find_customer_most_recent_quote.
// A "teklifi gönder" utterance no longer matches this extension's own
// grammar at all.

const { offerManagementConversationExtension } = await import("../offer-management-conversation-extension");

describe("offer-management-conversation-extension — WhatsApp send retired", () => {
  it("no longer claims a quote WhatsApp-send utterance — falls through to the Executive Agent", async () => {
    vi.stubGlobal("window", { location: { pathname: "/metrix" } });
    const result = await offerManagementConversationExtension.execute("Atlas İnşaat teklifini gönder");
    expect(result.status).toBe("NOT_HANDLED");
    expect(result.handoff).toBeNull();
    vi.unstubAllGlobals();
  });
});
