import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  default: class OpenAI {
    responses = { create };
  },
}));
vi.mock("@/lib/ai/telemetry/openai-telemetry", () => ({ logOpenAiTelemetry: vi.fn() }));

import { parseRepGoalReport } from "../rep-goal-report-parser.service";

const originalApiKey = process.env.OPENAI_API_KEY;

function respond(output: unknown) {
  create.mockResolvedValue({ output_text: JSON.stringify(output) });
}

describe("parseRepGoalReport", () => {
  beforeAll(() => { process.env.OPENAI_API_KEY = "test-key"; });
  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  });
  beforeEach(() => create.mockReset());

  it("extracts all three targets for a named rep", async () => {
    respond({ repNameRaw: "Ahmet", visitTarget: 20, salesTarget: 500000, collectionTarget: 300000 });
    const result = await parseRepGoalReport({ message: "Ahmet için aylık 20 ziyaret, 500.000 TL satış ve 300.000 TL tahsilat hedefi koy." });
    expect(result).toEqual({ repNameRaw: "Ahmet", visitTarget: 20, salesTarget: 500000, collectionTarget: 300000 });
  });

  it("extracts a single stated target, leaving the others null", async () => {
    respond({ repNameRaw: "Mehmet", visitTarget: 15, salesTarget: null, collectionTarget: null });
    const result = await parseRepGoalReport({ message: "Mehmet'in bu ayki ziyaret hedefini 15 yap." });
    expect(result).toEqual({ repNameRaw: "Mehmet", visitTarget: 15, salesTarget: null, collectionTarget: null });
  });

  it("returns null when no target at all was stated, rather than fabricating one", async () => {
    respond({ repNameRaw: "Ahmet", visitTarget: null, salesTarget: null, collectionTarget: null });
    const result = await parseRepGoalReport({ message: "Ahmet'in bu ay nasıl gittiğini anlat." });
    expect(result).toBeNull();
  });

  it("drops a non-positive target rather than passing it through", async () => {
    respond({ repNameRaw: "Ahmet", visitTarget: -5, salesTarget: 0, collectionTarget: 100000 });
    const result = await parseRepGoalReport({ message: "x" });
    expect(result).toEqual({ repNameRaw: "Ahmet", visitTarget: null, salesTarget: null, collectionTarget: 100000 });
  });

  it("returns null when the provider omits the required repNameRaw", async () => {
    respond({ visitTarget: 10 });
    const result = await parseRepGoalReport({ message: "belirsiz mesaj" });
    expect(result).toBeNull();
  });

  it("returns null when the provider returns invalid JSON", async () => {
    create.mockResolvedValue({ output_text: "not json" });
    const result = await parseRepGoalReport({ message: "x" });
    expect(result).toBeNull();
  });

  it("returns null without calling the provider when no API key is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await parseRepGoalReport({ message: "x" });
    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
    process.env.OPENAI_API_KEY = "test-key";
  });
});
