import { describe, expect, it } from "vitest";

import { detectQuoteWorkflowSignals } from "../quote-workflow-lifecycle-detector";
import type { QuoteContextActiveItem } from "../quote-context-builder";

const activeQuote: QuoteContextActiveItem = {
  id: "quote-1",
  customerName: "ABC İnşaat",
  personName: null,
  title: "ABC yıllık hizmet teklifi",
  status: "DRAFT",
  amount: 100_000,
  sentAt: null,
  viewedAt: null,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
  events: [],
};

function detect(message: string) {
  return detectQuoteWorkflowSignals({
    message,
    activeItems: [activeQuote],
  });
}

describe("detectQuoteWorkflowSignals quote cancellation authority", () => {
  it.each([
    "ABC İnşaat teklifini iptal ettim.",
    "ABC İnşaat teklifini iptal ettik.",
    "ABC İnşaat teklifi iptal edildi.",
    "ABC İnşaat teklifi iptal oldu.",
  ])("produces QUOTE_CANCELLED for a completed cancellation event: %s", (message) => {
    expect(detect(message)).toMatchObject([
      {
        quoteId: activeQuote.id,
        signalType: "QUOTE_CANCELLED",
        proposedStatus: "CANCELLED",
      },
    ]);
  });

  it.each([
    "ABC İnşaat teklifini iptal et.",
    "ABC İnşaat teklifini iptal edelim.",
    "ABC İnşaat teklifini kaldıralım.",
    "ABC İnşaat bu teklifi kapat.",
    "ABC İnşaat bu teklifi bırak.",
    "ABC İnşaat teklifini iptal etmek istiyorum.",
    "ABC İnşaat teklifini iptal edebilir misin?",
    "ABC İnşaat teklifini yarın iptal edeceğim.",
  ])("does not produce a lifecycle signal for a cancellation request or intent: %s", (message) => {
    expect(detect(message)).toEqual([]);
  });

  it("preserves an existing positive quote lifecycle signal", () => {
    expect(detect("ABC İnşaat teklifi gönderdim.")).toMatchObject([
      {
        quoteId: activeQuote.id,
        signalType: "QUOTE_SENT",
        proposedStatus: "SENT",
      },
    ]);
  });
});
