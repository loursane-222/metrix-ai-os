import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  default: class OpenAI {
    responses = { create };
  },
}));
vi.mock("@/lib/ai/telemetry/openai-telemetry", () => ({ logOpenAiTelemetry: vi.fn() }));

import { parseRepRequestReview } from "../rep-request-review-parser.service";

const originalApiKey = process.env.OPENAI_API_KEY;

function respond(output: unknown) {
  create.mockResolvedValue({ output_text: JSON.stringify(output) });
}

describe("parseRepRequestReview", () => {
  beforeAll(() => { process.env.OPENAI_API_KEY = "test-key"; });
  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  });
  beforeEach(() => create.mockReset());

  it("extracts an approve decision with domain and entity reference", async () => {
    respond({ repNameRaw: "Ahmet", decision: "APPROVE", domain: "ORDER", entityReference: "Atlas İnşaat" });
    const result = await parseRepRequestReview({ message: "Ahmet'in Atlas İnşaat siparişini onayla." });
    expect(result).toEqual({ repNameRaw: "Ahmet", decision: "APPROVE", domain: "ORDER", entityReference: "Atlas İnşaat" });
  });

  it("extracts a reject decision without domain/entity", async () => {
    respond({ repNameRaw: "Ayşe", decision: "REJECT", domain: null, entityReference: null });
    const result = await parseRepRequestReview({ message: "Ayşe'nin talebini reddet." });
    expect(result).toEqual({ repNameRaw: "Ayşe", decision: "REJECT", domain: null, entityReference: null });
  });

  it("returns null when the provider says the message is ambiguous", async () => {
    create.mockResolvedValue({ output_text: "null" });
    const result = await parseRepRequestReview({ message: "talepler hakkında ne düşünüyorsun?" });
    expect(result).toBeNull();
  });

  it("drops an unrecognized domain rather than passing it through", async () => {
    respond({ repNameRaw: "Ahmet", decision: "APPROVE", domain: "NOT_A_REAL_DOMAIN", entityReference: null });
    const result = await parseRepRequestReview({ message: "x" });
    expect(result?.domain).toBeNull();
  });

  it("returns null without calling the provider when no API key is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await parseRepRequestReview({ message: "x" });
    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
    process.env.OPENAI_API_KEY = "test-key";
  });
});
