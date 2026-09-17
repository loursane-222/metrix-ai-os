export type PresentationField = { label: string; value: string };

export type PresentationRow = {
  id?: string;
  primary: string;
  secondary?: string;
  raw: Record<string, unknown>;
};

export type ListView = {
  type: "LIST";
  title: string;
  metrics: PresentationField[];
  rows: PresentationRow[];
};

export type EntityView = {
  type: "ENTITY";
  title: string;
  fields: PresentationField[];
  raw: Record<string, unknown>;
};

export type MetricsView = {
  type: "METRICS";
  title: string;
  metrics: PresentationField[];
};

export type ChartView = {
  type: "CHART";
  title: string;
  series: { label: string; value: number }[];
};

export type CalendarView = {
  type: "CALENDAR";
  title: string;
  mode: "MONTH" | "WEEK" | "DAY";
  referenceDate: string;
  events: CalendarPresentationEvent[];
};

export type CalendarPresentationEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
};

export type DocumentView = {
  type: "DOCUMENT";
  title: string;
  artifactId: string;
  version: number;
  previewHtml: string;
};

export type Presentation =
  | ListView
  | EntityView
  | MetricsView
  | ChartView
  | CalendarView
  | DocumentView;
