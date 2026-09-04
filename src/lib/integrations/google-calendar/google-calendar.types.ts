export type GoogleCalendarEventSource = {
  provider: "google-calendar";
  eventId: string;
  calendarId: "primary";
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  attendees: string[];
  htmlLink: string;
};

// No "requested" flag (unlike GmailRetrievalContext): this service has no
// free-text trigger-phrase path of its own — it is only ever invoked
// explicitly, by the Google ConnectorAdapter's read() for a requested
// factScope, so every call here already IS a deliberate request.
export type CalendarRetrievalContext = {
  status: "OK" | "NOT_CONNECTED" | "RECONNECT_REQUIRED" | "NO_RESULTS" | "UNAVAILABLE";
  retrievedAt: string;
  events: GoogleCalendarEventSource[];
};
