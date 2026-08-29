import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  default: class OpenAI {
    responses = { create };
  },
}));
vi.mock("@/lib/ai/telemetry/openai-telemetry", () => ({ logOpenAiTelemetry: vi.fn() }));

import { parseReportReview } from "../report-review-parser.service";

const originalApiKey = process.env.OPENAI_API_KEY;

function respond(output: unknown) {
  create.mockResolvedValue({ output_text: JSON.stringify(output) });
}

describe("parseReportReview", () => {
  beforeAll(() => { process.env.OPENAI_API_KEY = "test-key"; });
  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  });
  beforeEach(() => create.mockReset());

  it("extracts an approval decision", async () => {
    respond({ repNameRaw: "Ahmet", decision: "APPROVED", note: null });
    const result = await parseReportReview({ message: "Ahmet'in bu haftaki raporunu onayla." });
    expect(result).toEqual({ repNameRaw: "Ahmet", decision: "APPROVED", note: null });
  });

  it("extracts a needs-revision decision with a note", async () => {
    respond({ repNameRaw: "Ayşe", decision: "NEEDS_REVISION", note: "Müşteri riskini de yazsın." });
    const result = await parseReportReview({ message: "Ayşe'nin raporu eksik, müşteri riskini de yazsın diye geri gönder." });
    expect(result).toEqual({ repNameRaw: "Ayşe", decision: "NEEDS_REVISION", note: "Müşteri riskini de yazsın." });
  });

  it("returns null when the provider says the message is ambiguous", async () => {
    create.mockResolvedValue({ output_text: "null" });
    const result = await parseReportReview({ message: "raporlar hakkında ne düşünüyorsun?" });
    expect(result).toBeNull();
  });

  it("returns null on an invalid decision value", async () => {
    respond({ repNameRaw: "Ahmet", decision: "MAYBE", note: null });
    const result = await parseReportReview({ message: "x" });
    expect(result).toBeNull();
  });

  it("returns null without calling the provider when no API key is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await parseReportReview({ message: "x" });
    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
    process.env.OPENAI_API_KEY = "test-key";
  });
});
