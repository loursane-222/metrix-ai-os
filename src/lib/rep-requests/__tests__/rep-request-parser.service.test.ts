import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  default: class OpenAI {
    responses = { create };
  },
}));
vi.mock("@/lib/ai/telemetry/openai-telemetry", () => ({ logOpenAiTelemetry: vi.fn() }));

import { parseRepRequest } from "../rep-request-parser.service";

const originalApiKey = process.env.OPENAI_API_KEY;

function respond(output: unknown) {
  create.mockResolvedValue({ output_text: JSON.stringify(output) });
}

describe("parseRepRequest", () => {
  beforeAll(() => { process.env.OPENAI_API_KEY = "test-key"; });
  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  });
  beforeEach(() => create.mockReset());

  it("extracts an order request with only a customer and notes", async () => {
    respond({ customerNameRaw: "Atlas İnşaat", title: null, amount: null, currency: null, notes: "50 adet çimento", deadlineAt: null });
    const result = await parseRepRequest({ domain: "ORDER", message: "Atlas İnşaat için sipariş açmak istiyorum, 50 adet çimento istiyorlar, onaya gönder." });
    expect(result).toEqual({ customerNameRaw: "Atlas İnşaat", title: null, amount: null, currency: null, notes: "50 adet çimento", deadlineAt: null });
  });

  it("extracts a quote request with a title and amount", async () => {
    respond({ customerNameRaw: "Beta Lojistik", title: "Nakliye teklifi", amount: 50000, currency: null, notes: null, deadlineAt: null });
    const result = await parseRepRequest({ domain: "QUOTE", message: "Beta Lojistik'e 50.000 TL'lik nakliye teklifi hazırla, onayına sun." });
    expect(result).toMatchObject({ customerNameRaw: "Beta Lojistik", title: "Nakliye teklifi", amount: 50000 });
  });

  it("returns null when the required customerNameRaw is missing", async () => {
    respond({ customerNameRaw: null, title: null, amount: 1000, currency: null, notes: null, deadlineAt: null });
    const result = await parseRepRequest({ domain: "PAYMENT", message: "10.000 TL tahsilat için onay istiyorum." });
    expect(result).toBeNull();
  });

  it("drops a non-positive amount rather than passing it through", async () => {
    respond({ customerNameRaw: "Arde Yapı", title: null, amount: -5, currency: null, notes: null, deadlineAt: null });
    const result = await parseRepRequest({ domain: "PAYMENT", message: "x" });
    expect(result?.amount).toBeNull();
  });

  it("returns null when the provider returns invalid JSON", async () => {
    create.mockResolvedValue({ output_text: "not json" });
    const result = await parseRepRequest({ domain: "ORDER", message: "x" });
    expect(result).toBeNull();
  });

  it("returns null without calling the provider when no API key is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await parseRepRequest({ domain: "ORDER", message: "x" });
    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
    process.env.OPENAI_API_KEY = "test-key";
  });
});
