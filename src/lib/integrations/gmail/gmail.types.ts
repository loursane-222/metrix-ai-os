export type GmailConnectionStatus = {
  connected: boolean;
  providerEmail: string | null;
  readOnly: true;
  status: "CONNECTED" | "RECONNECT_REQUIRED" | "NOT_CONNECTED";
  connectedAt: string | null;
  lastSuccessfulAccessAt: string | null;
  lastErrorCode: string | null;
};

export type GmailMessageSource = {
  provider: "gmail";
  messageId: string;
  threadId: string;
  gmailUrl: string;
  sender: string;
  recipients: string;
  subject: string;
  receivedAt: string;
  snippet: string;
  body: string;
};

export type GmailRetrievalContext = {
  requested: boolean;
  status: "OK" | "NOT_CONNECTED" | "RECONNECT_REQUIRED" | "NO_RESULTS" | "UNAVAILABLE";
  retrievedAt: string;
  messages: GmailMessageSource[];
};
