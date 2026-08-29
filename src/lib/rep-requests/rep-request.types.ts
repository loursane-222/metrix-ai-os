export type RepRequestDomain = "ORDER" | "QUOTE" | "PAYMENT";

export type RepRequestExtraction = Readonly<{
  customerNameRaw: string;
  title: string | null;
  amount: number | null;
  currency: string | null;
  notes: string | null;
  deadlineAt: string | null;
}>;

export type RepRequestParseInput = Readonly<{
  domain: RepRequestDomain;
  message: string;
}>;

export type RepRequestReviewDecision = "APPROVE" | "REJECT";

export type RepRequestReviewExtraction = Readonly<{
  repNameRaw: string;
  decision: RepRequestReviewDecision;
  domain: RepRequestDomain | null;
  entityReference: string | null;
}>;

export type RepRequestReviewParseInput = Readonly<{ message: string }>;
