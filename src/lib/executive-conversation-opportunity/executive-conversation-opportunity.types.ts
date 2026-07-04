// ─── Executive Conversation Opportunity Engine V1 — Type Definitions ──────────
//
// Prisma import yok. DB bağımlılığı yok. Saf tip tanımlarıdır.

import type { CuriosityReadinessGrade } from "@/lib/executive-curiosity";
import type { ExecutiveQuestion } from "@/lib/executive-question";

export type { CuriosityReadinessGrade, ExecutiveQuestion };

export type ConversationOpportunityTiming =
  | "NOW"
  | "NEXT_TURN"
  | "DEFER"
  | "SKIP";

export type ConversationSnapshot = {
  messageCount: number;
  isUserAsking: boolean;
  isUserSharing: boolean;
  topicHints: string[];
  recentlyAskedKeys: string[];
};

export type ConversationOpportunity = {
  generatedAt: string;
  shouldAskNow: boolean;
  timing: ConversationOpportunityTiming;
  selectedQuestion: string;
  reason: string;
  confidence: number;
  targetKey: string;
  readinessGrade: CuriosityReadinessGrade;
};

export type BuildConversationOpportunityInput = {
  question: ExecutiveQuestion;
  snapshot: ConversationSnapshot;
};
