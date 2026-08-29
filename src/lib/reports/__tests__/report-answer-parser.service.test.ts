import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  default: class OpenAI {
    responses = { create };
  },
}));
vi.mock("@/lib/ai/telemetry/openai-telemetry", () => ({ logOpenAiTelemetry: vi.fn() }));

import { parseReportAnswers } from "../report-answer-parser.service";

const originalApiKey = process.env.OPENAI_API_KEY;

function respond(output: unknown) {
  create.mockResolvedValue({ output_text: JSON.stringify(output) });
}

const questions = [
  { key: "important_development", label: "Bu haftanın önemli gelişmesi" },
  { key: "customer_risk", label: "Sistemde görünmeyen müşteri riski" },
];

describe("parseReportAnswers", () => {
  beforeAll(() => { process.env.OPENAI_API_KEY = "test-key"; });
  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  });
  beforeEach(() => create.mockReset());

  it("extracts only the questions the message actually answered", async () => {
    respond({ answers: [{ key: "important_development", value: "Arde Yapı ile anlaşma imzalandı." }] });

    const result = await parseReportAnswers({ message: "Bu hafta Arde Yapı ile anlaşma imzaladık.", questions });

    expect(result).toEqual([{ key: "important_development", value: "Arde Yapı ile anlaşma imzalandı." }]);
  });

  it("drops an answer key that isn't in the given question list rather than passing it through", async () => {
    respond({ answers: [{ key: "not_a_real_question", value: "uydurma" }] });
    const result = await parseReportAnswers({ message: "x", questions });
    expect(result).toEqual([]);
  });

  it("drops an answer with an empty value", async () => {
    respond({ answers: [{ key: "important_development", value: "   " }] });
    const result = await parseReportAnswers({ message: "x", questions });
    expect(result).toEqual([]);
  });

  it("returns an empty array when nothing was answered", async () => {
    respond({ answers: [] });
    const result = await parseReportAnswers({ message: "bugün hava çok güzel", questions });
    expect(result).toEqual([]);
  });

  it("returns an empty array when the provider returns invalid JSON", async () => {
    create.mockResolvedValue({ output_text: "not json" });
    const result = await parseReportAnswers({ message: "x", questions });
    expect(result).toEqual([]);
  });

  it("returns an empty array without calling the provider when there are no open questions", async () => {
    const result = await parseReportAnswers({ message: "x", questions: [] });
    expect(result).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns an empty array without calling the provider when no API key is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await parseReportAnswers({ message: "x", questions });
    expect(result).toEqual([]);
    expect(create).not.toHaveBeenCalled();
    process.env.OPENAI_API_KEY = "test-key";
  });
});
