export type PresentationField = { label: string; value: string };

export type PresentationRow = {
  id?: string;
  primary: string;
  secondary?: string;
  // Set only when the underlying record itself says it is unread.
  unread?: boolean;
  // A natural-language request the row can send back to METRIX when it is
  // chosen (e.g. "open this mail"). It is ordinary user text — the
  // Executive resolves it against real tool results — never a hidden
  // identifier or a UI-side guess of what is meant.
  prompt?: string;
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
// One opened mail, readable in full. `body` is plain text derived from the
// message the provider returned; the view never renders sender-supplied
// markup.
export type MailView = {
  type: "MAIL";
  title: string;
  subject: string;
  from: string;
  to: string;
  date: string | null;
  unread: boolean;
  body: string;
  bodyTruncated: boolean;
  // How many other messages the same conversation has.
  threadCount: number;
};

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
  | MailView
  | ConnectActionView;
