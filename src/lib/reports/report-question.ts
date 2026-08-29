import type { ReportAnswer, ReportTemplateVersion } from "@prisma/client";

export type ReportQuestion = Readonly<{ key: string; label: string }>;

function asFixedCoreQuestions(value: unknown): ReportQuestion[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is { key: unknown; label: unknown } => Boolean(item) && typeof item === "object")
    .map((item) => ({ key: item.key, label: item.label }))
    .filter((item): item is ReportQuestion => typeof item.key === "string" && typeof item.label === "string");
}

// focusedSectionJson/dynamicQuestionsJson are stored as plain string arrays
// (ReportsPanel posts comma-split text, company-report.service.ts writes it
// straight through) — no stable key exists per question yet. Since template
// versions are immutable once created (createReportTemplateVersion never
// mutates a past version), a question's position in its array is permanent
// for that version, so a position-derived key ("focused:0") is safe to use
// as ReportAnswer.questionKey.
function asPositionalQuestions(value: unknown, prefix: "focused" | "dynamic"): ReportQuestion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((label, index) => ({ key: `${prefix}:${index}`, label }))
    .filter((item): item is ReportQuestion => typeof item.label === "string" && item.label.trim().length > 0);
}

export function buildQuestionList(templateVersion: Pick<ReportTemplateVersion, "fixedCoreJson" | "focusedSectionJson" | "dynamicQuestionsJson">): ReportQuestion[] {
  return [
    ...asFixedCoreQuestions(templateVersion.fixedCoreJson),
    ...asPositionalQuestions(templateVersion.focusedSectionJson, "focused"),
    ...asPositionalQuestions(templateVersion.dynamicQuestionsJson, "dynamic"),
  ];
}

export function buildOpenQuestionList(
  templateVersion: Pick<ReportTemplateVersion, "fixedCoreJson" | "focusedSectionJson" | "dynamicQuestionsJson">,
  existingAnswers: readonly Pick<ReportAnswer, "questionKey">[],
): ReportQuestion[] {
  const answeredKeys = new Set(existingAnswers.map((answer) => answer.questionKey));
  return buildQuestionList(templateVersion).filter((question) => !answeredKeys.has(question.key));
}
