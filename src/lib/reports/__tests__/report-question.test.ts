import { describe, expect, it } from "vitest";
import { buildOpenQuestionList, buildQuestionList } from "../report-question";

const templateVersion = {
  fixedCoreJson: [{ key: "important_development", label: "Bu haftanın önemli gelişmesi" }],
  focusedSectionJson: ["Müşteri riski", "Destek ihtiyacı"],
  dynamicQuestionsJson: ["Sistemde görünmeyen önemli konu"],
};

describe("buildQuestionList", () => {
  it("merges fixed-core, focused-section and dynamic questions with stable positional keys", () => {
    const result = buildQuestionList(templateVersion);
    expect(result).toEqual([
      { key: "important_development", label: "Bu haftanın önemli gelişmesi" },
      { key: "focused:0", label: "Müşteri riski" },
      { key: "focused:1", label: "Destek ihtiyacı" },
      { key: "dynamic:0", label: "Sistemde görünmeyen önemli konu" },
    ]);
  });

  it("tolerates null focusedSectionJson/dynamicQuestionsJson", () => {
    const result = buildQuestionList({ fixedCoreJson: [{ key: "a", label: "A" }], focusedSectionJson: null, dynamicQuestionsJson: null });
    expect(result).toEqual([{ key: "a", label: "A" }]);
  });
});

describe("buildOpenQuestionList", () => {
  it("excludes questions that already have an answer", () => {
    const result = buildOpenQuestionList(templateVersion, [{ questionKey: "focused:0" }, { questionKey: "important_development" }]);
    expect(result).toEqual([
      { key: "focused:1", label: "Destek ihtiyacı" },
      { key: "dynamic:0", label: "Sistemde görünmeyen önemli konu" },
    ]);
  });

  it("returns the full list when nothing has been answered yet", () => {
    const result = buildOpenQuestionList(templateVersion, []);
    expect(result).toHaveLength(4);
  });
});
