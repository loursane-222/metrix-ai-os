import type { ReportQuestion } from "./report-question";

export type ReportAnswerExtracted = Readonly<{ key: string; value: string }>;

export type ReportAnswerParseInput = Readonly<{
  message: string;
  questions: readonly ReportQuestion[];
}>;
