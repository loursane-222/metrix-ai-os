import type {
  BuildExecutiveAccountabilityInput,
  ExecutiveAccountabilityActor,
  ExecutiveAccountabilityAlert,
  ExecutiveAccountabilityItem,
  ExecutiveAccountabilityOwnerSource,
  ExecutiveAccountabilityReminderPolicy,
  ExecutiveAccountabilityResult,
  ExecutiveActionSummary,
} from "./executive-accountability.types";
import {
  buildAccountabilityPromptSummary,
  buildAccountabilitySummaryLine,
  mostUrgentReminderPolicy,
} from "./executive-accountability-summary.service";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const UPCOMING_DEADLINE_DAYS = 3;

export function buildExecutiveAccountability(
  input: BuildExecutiveAccountabilityInput,
): ExecutiveAccountabilityResult {
  const now = input.now ?? new Date();
  const warnings: string[] = [];

  if (!input.executiveDecisionContext) warnings.push("executiveDecisionContext missing");
  if (!input.executiveDecisionFollowUp) warnings.push("executiveDecisionFollowUp missing");

  const committedItems = (input.executiveDecisionContext?.committedDecisions ?? []).map((decision) =>
    buildDecisionAccountabilityItem({
      id: `decision:${decision.id}`,
      title: decision.title,
      actionHint: decision.actionHint,
      dueAt: decision.followUpDueAt,
      now,
      input,
    }),
  );

  const conversationItem = buildConversationStateItem(input, now);
  const actionItems = buildActionAccountabilityItems(input.executiveActions ?? [], now);
  const accountableItems = dedupeItems([
    ...committedItems,
    ...(conversationItem ? [conversationItem] : []),
    ...actionItems,
  ]).sort(compareAccountabilityItems);

  const overdueCommitments = accountableItems.filter(
    (item) => item.daysOverdue !== null && item.daysOverdue > 0,
  );
  const missingOwners = accountableItems.filter((item) => item.ownerSource === "UNKNOWN");
  const upcomingDeadlines = accountableItems.filter((item) => {
    if (item.daysOverdue !== null && item.daysOverdue > 0) return false;
    const daysUntilDue = daysUntil(item.dueAt, now);
    return daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= UPCOMING_DEADLINE_DAYS;
  });
  const accountabilityAlerts = buildAccountabilityAlerts(input);
  const primaryAccountabilityIssue =
    overdueCommitments[0] ?? missingOwners[0] ?? upcomingDeadlines[0] ?? null;
  const summaryLine = buildAccountabilitySummaryLine({
    primaryIssue: primaryAccountabilityIssue,
    overdueCount: overdueCommitments.length,
    missingOwnerCount: missingOwners.length,
    upcomingDeadlineCount: upcomingDeadlines.length,
    alertCount: accountabilityAlerts.length,
  });
  const promptSummary = buildAccountabilityPromptSummary({
    summaryLine,
    primaryIssue: primaryAccountabilityIssue,
    overdueCount: overdueCommitments.length,
    missingOwnerCount: missingOwners.length,
    upcomingDeadlineCount: upcomingDeadlines.length,
    alerts: accountabilityAlerts,
  });

  return {
    organizationId: input.organizationId,
    generatedAt: now.toISOString(),
    accountableItems,
    overdueCommitments,
    missingOwners,
    upcomingDeadlines,
    accountabilityAlerts,
    primaryAccountabilityIssue,
    summaryLine,
    promptSummary: {
      ...promptSummary,
      reminderPolicy: primaryAccountabilityIssue
        ? primaryAccountabilityIssue.reminderPolicy
        : mostUrgentReminderPolicy(accountableItems),
    },
    diagnostics: {
      generatedAt: now.toISOString(),
      sourceCommittedDecisionCount: input.executiveDecisionContext?.committedDecisions.length ?? 0,
      sourceFollowUpItemCount: input.executiveDecisionFollowUp?.items.length ?? 0,
      sourcePersonCount: input.personContext?.length ?? 0,
      sourceMemoryCount: input.memoryContext?.totalIncluded ?? 0,
      sourceCollectionActionCount: input.collectionActionContext?.items.length ?? 0,
      sourceExecutiveActionCount: input.executiveActions?.length ?? 0,
      warnings,
    },
  };
}

function buildDecisionAccountabilityItem(input: {
  id: string;
  title: string;
  actionHint: string | null;
  dueAt: string | null;
  now: Date;
  input: BuildExecutiveAccountabilityInput;
}): ExecutiveAccountabilityItem {
  const owner = resolveOwner({
    title: input.title,
    actionHint: input.actionHint,
    input: input.input,
  });
  const daysOverdue = computeDaysOverdue(input.dueAt, input.now);
  const reminderPolicy = resolveReminderPolicy(daysOverdue, owner.source);
  const needsClarification = owner.source === "UNKNOWN";

  return {
    id: input.id,
    title: input.title,
    actor: owner.actor,
    ownerName: owner.name,
    ownerSource: owner.source,
    expectedAction: input.actionHint ?? input.title,
    dueAt: input.dueAt,
    daysOverdue,
    reminderPolicy,
    needsClarification,
    clarifyingQuestion: needsClarification
      ? `"${input.title}" için sorumluluk kimde ve sonucu ne zaman bekleyelim?`
      : null,
    source: "DECISION",
  };
}

function buildConversationStateItem(
  input: BuildExecutiveAccountabilityInput,
  now: Date,
): ExecutiveAccountabilityItem | null {
  const state = input.conversationState;
  if (!state || state.phase !== "COMMITTED" || !state.committedTitle || state.commitmentOutcome) {
    return null;
  }

  return buildDecisionAccountabilityItem({
    id: `conversation:${normalizeKey(state.committedTitle)}`,
    title: state.committedTitle,
    actionHint: state.commitmentRequest,
    dueAt: state.followUpDueAt,
    now,
    input,
  });
}

function resolveOwner(input: {
  title: string;
  actionHint: string | null;
  input: BuildExecutiveAccountabilityInput;
}): {
  actor: ExecutiveAccountabilityActor;
  name: string | null;
  source: ExecutiveAccountabilityOwnerSource;
} {
  const text = `${input.title} ${input.actionHint ?? ""}`;
  const explicitOwner = extractExplicitOwner(text);
  if (explicitOwner) {
    return { actor: "TEAM_MEMBER", name: explicitOwner, source: "EXPLICIT" };
  }

  if (looksLikeUserCommitment(text)) {
    return {
      actor: "USER",
      name: input.input.currentUserName?.trim() || "Kullanıcı",
      source: "INFERRED_USER",
    };
  }

  const paymentOwner = findPaymentOwner(text, input.input);
  if (paymentOwner) {
    return { actor: "CUSTOMER", name: paymentOwner, source: "PAYMENT_PERSON" };
  }

  const personOwner = findPersonOwner(text, input.input.personContext ?? []);
  if (personOwner) {
    return { actor: "TEAM_MEMBER", name: personOwner, source: "EXPLICIT" };
  }

  const memoryOwner = findMemoryOwner(text, input.input.memoryContext);
  if (memoryOwner) {
    return { actor: "ORGANIZATION", name: memoryOwner, source: "MEMORY" };
  }

  return { actor: "UNKNOWN", name: null, source: "UNKNOWN" };
}

function buildAccountabilityAlerts(
  input: BuildExecutiveAccountabilityInput,
): ExecutiveAccountabilityAlert[] {
  const alerts: ExecutiveAccountabilityAlert[] = [];
  const seen = new Set<string>();

  for (const item of input.executiveDecisionFollowUp?.items ?? []) {
    if (
      item.status !== "RESOLVED_FAILURE" &&
      item.status !== "ABANDONED" &&
      item.status !== "REAGENDA_REQUIRED"
    ) {
      continue;
    }

    const key = `${item.status}:${normalizeKey(item.title)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    alerts.push({
      id: item.id,
      title: item.title,
      line:
        item.status === "ABANDONED"
          ? `${item.title}: vazgeçilen karar için yeni yol gerekebilir.`
          : `${item.title}: sonuç zayıf; yeni aksiyon netleşmeli.`,
      severity: item.status === "REAGENDA_REQUIRED" ? "HIGH" : "WATCH",
      source: item.source === "OUTCOME" ? "OUTCOME" : "FOLLOW_UP",
    });
  }

  const latestOutcome = input.executiveDecisionContext?.latestOutcome;
  if (
    latestOutcome &&
    (latestOutcome.outcome === "FAILURE" || latestOutcome.outcome === "ABANDONED")
  ) {
    const key = `${latestOutcome.outcome}:${normalizeKey(latestOutcome.decisionTitle)}`;
    if (!seen.has(key)) {
      alerts.push({
        id: `outcome:${latestOutcome.id}`,
        title: latestOutcome.decisionTitle,
        line:
          latestOutcome.outcome === "ABANDONED"
            ? `${latestOutcome.decisionTitle}: vazgeçildi; sebep ve yeni yön netleşmeli.`
            : `${latestOutcome.decisionTitle}: başarısız sonuçlandı; engel sorulmalı.`,
        severity: "HIGH",
        source: "OUTCOME",
      });
    }
  }

  return alerts.slice(0, 5);
}

function resolveReminderPolicy(
  daysOverdue: number | null,
  ownerSource: ExecutiveAccountabilityOwnerSource,
): ExecutiveAccountabilityReminderPolicy {
  if (ownerSource === "UNKNOWN") return "ASK_SOFTLY";
  if (daysOverdue === null || daysOverdue <= 0) return "SILENT";
  if (daysOverdue <= 3) return "ASK_DIRECTLY";
  return "ESCALATE";
}

function computeDaysOverdue(dueAt: string | null, now: Date): number | null {
  const dueDate = parseDate(dueAt);
  if (!dueDate || dueDate.getTime() > now.getTime()) return null;
  return Math.max(1, Math.floor((now.getTime() - dueDate.getTime()) / MS_PER_DAY) + 1);
}

function daysUntil(dueAt: string | null, now: Date): number | null {
  const dueDate = parseDate(dueAt);
  if (!dueDate) return null;
  return Math.ceil((dueDate.getTime() - now.getTime()) / MS_PER_DAY);
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractExplicitOwner(text: string): string | null {
  const match = text.match(/(?:sorumlu|sahibi|kimde)\s*[:：-]\s*([A-ZÇĞİÖŞÜa-zçğıöşü\s]{2,40})/i);
  return match?.[1]?.trim() ?? null;
}

function looksLikeUserCommitment(text: string): boolean {
  return /\b(ben|biz|kapatacağım|kapatacağız|yapacağım|yapacağız|arayacağım|arayacağız|bitireceğim|bitireceğiz|tamamlayacağım|tamamlayacağız)\b/i.test(text);
}

function findPaymentOwner(
  text: string,
  input: BuildExecutiveAccountabilityInput,
): string | null {
  const candidates = [
    ...(input.paymentContext?.overdueItems ?? []).map((item) => item.customerName),
    ...(input.paymentContext?.partialItems ?? []).map((item) => item.customerName),
    ...(input.paymentIntelligence?.prioritizedItems ?? []).map((item) => item.customerName),
    ...(input.collectionActionContext?.items ?? []).map((item) => item.customerName),
  ];

  return findMentionedName(text, candidates);
}

function findPersonOwner(
  text: string,
  people: Array<{ fullName: string }>,
): string | null {
  return findMentionedName(text, people.map((person) => person.fullName));
}

function findMemoryOwner(text: string, memoryContext: BuildExecutiveAccountabilityInput["memoryContext"]): string | null {
  const items = [
    ...(memoryContext?.facts ?? []),
    ...(memoryContext?.processes ?? []),
    ...(memoryContext?.strategic ?? []),
  ];
  const ownerLike = items.find((item) => {
    const key = normalizeKey(item.key);
    return (
      (key.includes("sorumlu") || key.includes("owner") || key.includes("yetkili")) &&
      normalizeKey(text).includes(normalizeKey(item.value).slice(0, 24))
    );
  });

  return ownerLike?.value ?? null;
}

function findMentionedName(text: string, names: string[]): string | null {
  const normalizedText = normalizeKey(text);
  const uniqueNames = [...new Set(names.map((name) => name.trim()).filter(Boolean))];

  return (
    uniqueNames.find((name) => {
      const normalizedName = normalizeKey(name);
      return normalizedName.length >= 3 && normalizedText.includes(normalizedName);
    }) ?? null
  );
}

function dedupeItems(items: ExecutiveAccountabilityItem[]): ExecutiveAccountabilityItem[] {
  const seen = new Set<string>();
  const result: ExecutiveAccountabilityItem[] = [];

  for (const item of items) {
    const key = normalizeKey(item.title);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function compareAccountabilityItems(
  left: ExecutiveAccountabilityItem,
  right: ExecutiveAccountabilityItem,
): number {
  return (
    policyRank(right.reminderPolicy) - policyRank(left.reminderPolicy) ||
    (right.daysOverdue ?? 0) - (left.daysOverdue ?? 0) ||
    nullableTime(left.dueAt) - nullableTime(right.dueAt)
  );
}

function policyRank(policy: ExecutiveAccountabilityReminderPolicy): number {
  const map: Record<ExecutiveAccountabilityReminderPolicy, number> = {
    SILENT: 1,
    ASK_SOFTLY: 2,
    ASK_DIRECTLY: 3,
    ESCALATE: 4,
  };
  return map[policy];
}

function nullableTime(value: string | null): number {
  return parseDate(value)?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function normalizeKey(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
}

// ─── Executive Action → AccountabilityItem ────────────────────────────────────

const MAX_ACTION_ACCOUNTABILITY_ITEMS = 3;

function buildActionAccountabilityItems(
  actions: ExecutiveActionSummary[],
  now: Date,
): ExecutiveAccountabilityItem[] {
  return actions
    .filter((a) => a.sourceType !== "DECISION")
    .map((a) => executiveActionToAccountabilityItem(a, now))
    .filter((item) => item.reminderPolicy !== "SILENT")
    .sort(compareAccountabilityItems)
    .slice(0, MAX_ACTION_ACCOUNTABILITY_ITEMS);
}

function executiveActionToAccountabilityItem(
  action: ExecutiveActionSummary,
  now: Date,
): ExecutiveAccountabilityItem {
  const dueAt = action.dueDate?.toISOString() ?? null;
  const daysOverdue = dueAt ? computeDaysOverdue(dueAt, now) : null;
  const ageDays = Math.floor((now.getTime() - action.createdAt.getTime()) / MS_PER_DAY);

  const ownerType = action.ownerType;
  const actor = actionOwnerToActor(ownerType);
  const ownerSource = actionOwnerToOwnerSource(ownerType);
  const reminderPolicy = resolveActionReminderPolicy({ ownerType, daysOverdue, ageDays, status: action.status });
  const needsClarification = ownerType === "UNASSIGNED";

  return {
    id: `action:${action.id}`,
    title: action.title,
    actor,
    ownerName: null,
    ownerSource,
    expectedAction: action.title,
    dueAt,
    daysOverdue,
    reminderPolicy,
    needsClarification,
    clarifyingQuestion: needsClarification
      ? `"${action.title}" aksiyonunun sorumlusu kim?`
      : null,
    source: "EXECUTIVE_ACTION",
  };
}

function resolveActionReminderPolicy(input: {
  ownerType: string;
  daysOverdue: number | null;
  ageDays: number;
  status: string;
}): ExecutiveAccountabilityReminderPolicy {
  if (input.ownerType === "UNASSIGNED") return "ASK_SOFTLY";
  if (input.status === "WAITING") return "SILENT";

  if (input.daysOverdue !== null) {
    if (input.daysOverdue > 7) return "ESCALATE";
    if (input.daysOverdue > 3) return "ASK_DIRECTLY";
    if (input.daysOverdue > 0) return "ASK_SOFTLY";
  }

  // dueDate yoksa yaşa göre
  if (input.ageDays > 10) return "ASK_DIRECTLY";
  if (input.ageDays > 5) return "ASK_SOFTLY";
  return "SILENT";
}

function actionOwnerToActor(ownerType: string): ExecutiveAccountabilityActor {
  if (ownerType === "USER") return "USER";
  if (ownerType === "PERSON") return "TEAM_MEMBER";
  return "UNKNOWN";
}

function actionOwnerToOwnerSource(ownerType: string): ExecutiveAccountabilityOwnerSource {
  if (ownerType === "USER") return "INFERRED_USER";
  if (ownerType === "PERSON") return "EXPLICIT";
  return "UNKNOWN";
}
