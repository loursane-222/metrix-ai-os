import type { OrganizationRole } from "@prisma/client";
import type { CollectionActionContext } from "@/lib/core/collection-actions/collection-action-context-builder";
import type { PaymentContext } from "@/lib/core/payments/payment-context-builder";
import type { PaymentIntelligence } from "@/lib/core/payments/payment-intelligence-builder";
import type { ExecutiveConversationState } from "@/lib/ai/executive-conversation.types";
import type { ExecutiveDecisionContext } from "@/lib/executive-decision-loop";
import type { ExecutiveDecisionFollowUpResult } from "@/lib/executive-decision-follow-up";
import type { ExecutiveOperatingPersonContextItem } from "@/lib/executive-operating-context/executive-operating-context.types";
import type { MemoryContext } from "@/lib/memory/memory-context.types";

export type ExecutiveAccountabilityActor =
  | "USER"
  | "CUSTOMER"
  | "TEAM_MEMBER"
  | "ORGANIZATION"
  | "UNKNOWN";

export type ExecutiveAccountabilityOwnerSource =
  | "EXPLICIT"
  | "INFERRED_USER"
  | "PAYMENT_PERSON"
  | "MEMORY"
  | "UNKNOWN";

export type ExecutiveAccountabilityReminderPolicy =
  | "SILENT"
  | "ASK_SOFTLY"
  | "ASK_DIRECTLY"
  | "ESCALATE";

export type ExecutiveAccountabilitySource =
  | "DECISION"
  | "FOLLOW_UP"
  | "CONVERSATION_STATE"
  | "OUTCOME"
  | "EXECUTIVE_ACTION";

export type ExecutiveActionSummary = {
  id: string;
  title: string;
  sourceType:
    | "EXECUTIVE_PRIORITY"
    | "DAILY_BRIEFING"
    | "MANAGEMENT_REVIEW"
    | "PERFORMANCE_SIGNAL"
    | "CUSTOMER_SIGNAL"
    | "DECISION"
    | "MANUAL";
  ownerType: "USER" | "PERSON" | "UNASSIGNED";
  ownerId: string | null;
  status: "OPEN" | "IN_PROGRESS" | "WAITING";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  dueDate: Date | null;
  createdAt: Date;
};

export type ExecutiveAccountabilityItem = {
  id: string;
  title: string;
  actor: ExecutiveAccountabilityActor;
  ownerName: string | null;
  ownerSource: ExecutiveAccountabilityOwnerSource;
  expectedAction: string;
  dueAt: string | null;
  daysOverdue: number | null;
  reminderPolicy: ExecutiveAccountabilityReminderPolicy;
  needsClarification: boolean;
  clarifyingQuestion: string | null;
  source: ExecutiveAccountabilitySource;
};

export type ExecutiveAccountabilityAlert = {
  id: string;
  title: string;
  line: string;
  severity: "WATCH" | "HIGH" | "CRITICAL";
  source: ExecutiveAccountabilitySource;
};

export type ExecutiveAccountabilityPromptSummary = {
  summaryLine: string;
  primaryIssueLine: string | null;
  reminderPolicy: ExecutiveAccountabilityReminderPolicy;
  overdueCount: number;
  missingOwnerCount: number;
  upcomingDeadlineCount: number;
  alertLines: string[];
  clarifyingQuestion: string | null;
};

export type ExecutiveAccountabilityDiagnostics = {
  generatedAt: string;
  sourceCommittedDecisionCount: number;
  sourceFollowUpItemCount: number;
  sourcePersonCount: number;
  sourceMemoryCount: number;
  sourceCollectionActionCount: number;
  sourceExecutiveActionCount: number;
  warnings: string[];
};

export type ExecutiveAccountabilityResult = {
  organizationId: string;
  generatedAt: string;
  accountableItems: ExecutiveAccountabilityItem[];
  overdueCommitments: ExecutiveAccountabilityItem[];
  missingOwners: ExecutiveAccountabilityItem[];
  upcomingDeadlines: ExecutiveAccountabilityItem[];
  accountabilityAlerts: ExecutiveAccountabilityAlert[];
  primaryAccountabilityIssue: ExecutiveAccountabilityItem | null;
  summaryLine: string;
  promptSummary: ExecutiveAccountabilityPromptSummary;
  diagnostics: ExecutiveAccountabilityDiagnostics;
};

export type BuildExecutiveAccountabilityInput = {
  organizationId: string;
  now?: Date;
  executiveDecisionContext: ExecutiveDecisionContext | null;
  executiveDecisionFollowUp: ExecutiveDecisionFollowUpResult | null;
  conversationState?: ExecutiveConversationState | null;
  personContext?: ExecutiveOperatingPersonContextItem[] | null;
  memoryContext?: MemoryContext | null;
  paymentContext?: PaymentContext | null;
  paymentIntelligence?: PaymentIntelligence | null;
  collectionActionContext?: CollectionActionContext | null;
  currentUserId?: string | null;
  currentUserName?: string | null;
  organizationMembershipRole?: OrganizationRole | null;
  executiveActions?: ExecutiveActionSummary[] | null;
};
