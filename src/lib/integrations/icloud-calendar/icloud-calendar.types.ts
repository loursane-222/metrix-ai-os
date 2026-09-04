export type IcloudCalendarEventSource = {
  provider: "icloud-calendar";
  eventId: string;
  calendarId: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  // Always empty: CalDAV ATTENDEE parsing is not implemented in this
  // read-only v1 (see caldav-client.ts's parseEventProps) — explicit empty,
  // never a guessed attendee list.
  attendees: string[];
  htmlLink: string;
  status: "CONFIRMED" | "CANCELLED";
};

export type IcloudCalendarRetrievalContext = {
  status: "OK" | "NOT_CONNECTED" | "AUTH_REQUIRED" | "NO_RESULTS" | "UNAVAILABLE";
  retrievedAt: string;
  events: IcloudCalendarEventSource[];
};

export type IcloudConnectionStatus = {
  connected: boolean;
  appleId: string | null;
  readOnly: true;
  status: "CONNECTED" | "AUTH_REQUIRED" | "NOT_CONNECTED" | "ERROR";
  connectedAt: string | null;
  lastSuccessfulAccessAt: string | null;
  lastErrorCode: string | null;
};
