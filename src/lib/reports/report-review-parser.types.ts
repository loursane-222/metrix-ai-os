export type ReportReviewDecision = "APPROVED" | "NEEDS_REVISION";

export type ReportReviewExtraction = Readonly<{
  repNameRaw: string;
  decision: ReportReviewDecision;
  note: string | null;
}>;

export type ReportReviewParseInput = Readonly<{ message: string }>;
