import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  default: class OpenAI {
    responses = { create };
  },
}));
vi.mock("@/lib/ai/telemetry/openai-telemetry", () => ({ logOpenAiTelemetry: vi.fn() }));

import { buildCompanyQueryJudgment } from "../company-query-judgment.service";

const originalApiKey = process.env.OPENAI_API_KEY;

describe("company query judgment — separate, fail-safe, single call", () => {
  beforeAll(() => { process.env.OPENAI_API_KEY = "test-key"; });
  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  });
  beforeEach(() => create.mockReset());

  it("returns the judgment text on success, calling the provider exactly once", async () => {
    create.mockResolvedValueOnce({ output_text: "Kanaatim: Vadeyi artırmak riskli olabilir." });
    const result = await buildCompanyQueryJudgment("Gerçekler: X.", "Sence vadeyi artırmalı mıyız?");
    expect(result).toBe("Kanaatim: Vadeyi artırmak riskli olabilir.");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("never sends the raw facts as something to recompute — the facts are only in `input`, and the instructions forbid changing them", async () => {
    create.mockResolvedValueOnce({ output_text: "Kanaatim: tamam." });
    await buildCompanyQueryJudgment("Alacak: 750 TRY.", "Ne yapmalıyım?");
    const call = create.mock.calls[0][0];
    expect(call.input).toContain("750 TRY");
    expect(call.instructions).toMatch(/değiştirme|uydurma/i);
  });

  it("fails closed to null (never throws, never blocks the fact answer) when the provider errors", async () => {
    create.mockRejectedValueOnce(new Error("boom"));
    await expect(buildCompanyQueryJudgment("facts", "question")).resolves.toBeNull();
  });

  it("fails closed to null when output is empty", async () => {
    create.mockResolvedValueOnce({ output_text: "" });
    await expect(buildCompanyQueryJudgment("facts", "question")).resolves.toBeNull();
  });

  it("returns null without calling the provider when no API key is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(buildCompanyQueryJudgment("facts", "question")).resolves.toBeNull();
    expect(create).not.toHaveBeenCalled();
    process.env.OPENAI_API_KEY = "test-key";
  });
});
