import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
vi.mock("openai", () => ({
  default: class OpenAI {
    responses = { create };
  },
}));
vi.mock("@/lib/ai/telemetry/openai-telemetry", () => ({ logOpenAiTelemetry: vi.fn() }));

const { resolveRepGoalAchievementMock, listFieldVisitsMock } = vi.hoisted(() => ({
  resolveRepGoalAchievementMock: vi.fn(),
  listFieldVisitsMock: vi.fn(),
}));
vi.mock("../rep-goal-achievement.service", () => ({ resolveRepGoalAchievement: resolveRepGoalAchievementMock }));
vi.mock("@/lib/core/field-visits/field-visit.service", () => ({ listFieldVisits: listFieldVisitsMock }));

import { buildRepMorningBriefing } from "../rep-morning-briefing.service";

const originalApiKey = process.env.OPENAI_API_KEY;
const REFERENCE = new Date("2026-08-29T06:00:00.000Z");
const goalStatus = { visitTarget: 10, visitActual: 2, salesTarget: null, salesActual: 0, collectionTarget: null, collectionActual: 0 };

describe("buildRepMorningBriefing", () => {
  beforeAll(() => { process.env.OPENAI_API_KEY = "test-key"; });
  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  });
  beforeEach(() => {
    create.mockReset();
    resolveRepGoalAchievementMock.mockReset();
    listFieldVisitsMock.mockReset().mockResolvedValue([]);
  });

  it("returns null when the rep has no active personal goal — nothing honest to brief", async () => {
    resolveRepGoalAchievementMock.mockResolvedValue(null);
    const result = await buildRepMorningBriefing("org-1", "user-2", REFERENCE);
    expect(result).toBeNull();
    expect(listFieldVisitsMock).not.toHaveBeenCalled();
  });

  it("returns the goal status with a null noteSuggestion when there are no notes to draw from", async () => {
    resolveRepGoalAchievementMock.mockResolvedValue(goalStatus);
    listFieldVisitsMock.mockResolvedValue([{ id: "v1", customerNameRaw: "Arde Yapı", notes: null }]);
    const result = await buildRepMorningBriefing("org-1", "user-2", REFERENCE);
    expect(result).toEqual({ goalStatus, noteSuggestion: null });
    expect(create).not.toHaveBeenCalled();
  });

  it("summarizes recent notes into a suggestion when notes exist", async () => {
    resolveRepGoalAchievementMock.mockResolvedValue(goalStatus);
    listFieldVisitsMock.mockResolvedValue([{ id: "v1", customerNameRaw: "Arde Yapı", notes: "Teşhir istedi." }]);
    create.mockResolvedValue({ output_text: "Arde Yapı'nın teşhir talebini bugün takip et." });

    const result = await buildRepMorningBriefing("org-1", "user-2", REFERENCE);

    expect(result).toEqual({ goalStatus, noteSuggestion: "Arde Yapı'nın teşhir talebini bugün takip et." });
    expect(listFieldVisitsMock).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", repUserId: "user-2", endAt: REFERENCE }));
  });

  it("skips visits with blank notes when composing the note text", async () => {
    resolveRepGoalAchievementMock.mockResolvedValue(goalStatus);
    listFieldVisitsMock.mockResolvedValue([{ id: "v1", customerNameRaw: "A", notes: "  " }, { id: "v2", customerNameRaw: "B", notes: null }]);
    const result = await buildRepMorningBriefing("org-1", "user-2", REFERENCE);
    expect(result?.noteSuggestion).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("returns a null noteSuggestion without calling the provider when no API key is configured", async () => {
    resolveRepGoalAchievementMock.mockResolvedValue(goalStatus);
    listFieldVisitsMock.mockResolvedValue([{ id: "v1", customerNameRaw: "Arde Yapı", notes: "Teşhir istedi." }]);
    delete process.env.OPENAI_API_KEY;

    const result = await buildRepMorningBriefing("org-1", "user-2", REFERENCE);

    expect(result?.noteSuggestion).toBeNull();
    expect(create).not.toHaveBeenCalled();
    process.env.OPENAI_API_KEY = "test-key";
  });
});
