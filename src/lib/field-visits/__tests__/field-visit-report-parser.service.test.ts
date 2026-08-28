import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  default: class OpenAI {
    responses = { create };
  },
}));
vi.mock("@/lib/ai/telemetry/openai-telemetry", () => ({ logOpenAiTelemetry: vi.fn() }));

import { parseFieldVisitReport } from "../field-visit-report-parser.service";

const originalApiKey = process.env.OPENAI_API_KEY;

function respond(output: unknown) {
  create.mockResolvedValue({ output_text: JSON.stringify(output) });
}

describe("parseFieldVisitReport", () => {
  beforeAll(() => { process.env.OPENAI_API_KEY = "test-key"; });
  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  });
  beforeEach(() => create.mockReset());

  it("extracts a full visit with order and payment intent", async () => {
    respond({
      customerNameRaw: "Arde Yapı",
      contactNameRaw: "Mehmet Bey",
      startTime: "09:00",
      endTime: "11:00",
      notes: "Mehmet Bey mağazası için teşhir istedi, 2 palet ürün sipariş geçti ve 10.000 TL ödeme yaptı.",
      requestTypes: ["DISPLAY_REQUEST"],
      orderIntent: { productRef: null, quantity: 2 },
      paymentIntent: { amount: 10000, currency: "TRY" },
    });

    const result = await parseFieldVisitReport({
      message: "Arde Yapı ile toplantı, 09:00-11:00, Mehmet Bey mağazası için teşhir istedi, 2 palet ürün sipariş geçti ve 10.000 TL ödeme yaptı.",
      referenceDate: "2026-08-29",
    });

    expect(result).toMatchObject({
      customerNameRaw: "Arde Yapı",
      contactNameRaw: "Mehmet Bey",
      startTime: "09:00",
      endTime: "11:00",
      requestTypes: ["DISPLAY_REQUEST"],
      orderIntent: { productRef: null, quantity: 2 },
      paymentIntent: { amount: 10000, currency: "TRY" },
    });
  });

  it("never fabricates a product ref when none was stated", async () => {
    respond({
      customerNameRaw: "Mehmet Bey",
      contactNameRaw: null,
      startTime: null,
      endTime: null,
      notes: "Birkaç ürün sipariş etmek istediğini söyledi.",
      requestTypes: [],
      orderIntent: { productRef: null, quantity: null },
      paymentIntent: null,
    });

    const result = await parseFieldVisitReport({
      message: "Mehmet Bey birkaç ürün sipariş etmek istediğini söyledi.",
      referenceDate: "2026-08-29",
    });

    expect(result?.orderIntent).toBeNull();
    expect(result?.paymentIntent).toBeNull();
  });

  it("drops an unrecognized requestType rather than passing it through", async () => {
    respond({
      customerNameRaw: "Arde Yapı",
      contactNameRaw: null,
      startTime: null,
      endTime: null,
      notes: "Ziyaret yapıldı.",
      requestTypes: ["NOT_A_REAL_TYPE"],
      orderIntent: null,
      paymentIntent: null,
    });

    const result = await parseFieldVisitReport({ message: "Arde Yapı ziyaret edildi.", referenceDate: "2026-08-29" });
    expect(result?.requestTypes).toEqual([]);
  });

  it("returns null when the provider omits the required customerNameRaw", async () => {
    respond({ notes: "eksik veri", requestTypes: [] });
    const result = await parseFieldVisitReport({ message: "belirsiz mesaj", referenceDate: "2026-08-29" });
    expect(result).toBeNull();
  });

  it("returns null when the provider returns invalid JSON", async () => {
    create.mockResolvedValue({ output_text: "not json" });
    const result = await parseFieldVisitReport({ message: "x", referenceDate: "2026-08-29" });
    expect(result).toBeNull();
  });

  it("returns null without calling the provider when no API key is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await parseFieldVisitReport({ message: "x", referenceDate: "2026-08-29" });
    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
    process.env.OPENAI_API_KEY = "test-key";
  });
});
