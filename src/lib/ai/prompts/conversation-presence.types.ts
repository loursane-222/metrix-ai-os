// Extensible signal describing how the current turn sits inside the ongoing
// conversation, so voice delivery (opening variety, tone) can eventually be
// shaped by real conversation state instead of a static instruction block.
// Today only recentTurnCount is populated by callers; the rest are reserved
// for future signals (company-culture cues, relationship familiarity,
// time-of-day) and are additive-only — never required.
export type ConversationPresenceSignal = {
  recentTurnCount?: number | null;
  lastUserTone?: "neutral" | "tense" | "positive" | null;
  timeSinceLastTurnMs?: number | null;
};
