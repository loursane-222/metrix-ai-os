export type RepGoalReportExtraction = Readonly<{
  repNameRaw: string;
  visitTarget: number | null;
  salesTarget: number | null;
  collectionTarget: number | null;
}>;

export type RepGoalReportParseInput = Readonly<{
  message: string;
}>;
