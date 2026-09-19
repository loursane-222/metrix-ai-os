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
  // Set only when the shown events cannot be trusted as the complete
  // calendar (a connected external calendar could not be read, or is not
  // connected and nothing else is shown). While present, the view must not
  // present an empty result as "no events".
  notice?: string;
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

// A temporary, conversation-born action surface — never a Settings/
// configuration screen. connectUrl is always one of NEXT's own routes
// (e.g. "/api/integrations/nylas/connect"), produced deterministically
// by the runtime; the model never sees or constructs a provider OAuth
// URL directly.
export type ConnectActionView = {
  type: "CONNECT_ACTION";
  title: string;
  provider: string;
  description: string;
  connectUrl: string;
};

export type Presentation =
  | ListView
  | EntityView
  | MetricsView
  | ChartView
  | CalendarView
  | DocumentView
  | ConnectActionView;
