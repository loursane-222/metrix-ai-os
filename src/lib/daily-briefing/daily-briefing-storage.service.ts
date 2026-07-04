import {
  createConversation,
  createMessage,
  findBriefingConversationByDate,
  findLastAiMessageByConversation,
  findLatestBriefingConversation,
} from "@/lib/core/conversations/conversation.repository";

import type { Prisma } from "@prisma/client";

import type { BriefingPackage } from "./daily-briefing.types";
import type { BriefingDailySummary } from "./daily-briefing-engine.service";
import type { ExecutiveDailyBriefingV2 } from "@/lib/executive-daily-briefing-v2";

// ─── Giriş / Çıkış Tipleri ───────────────────────────────────────────────────

export type StoreDailyBriefingInput = {
  organizationId: string;
  briefingPackage: BriefingPackage;
  summary: BriefingDailySummary;
  executiveDailyBriefingV2?: ExecutiveDailyBriefingV2;
};

export type StoreDailyBriefingResult = {
  conversationId: string;
  messageId: string;
  wasAlreadyStored: boolean;
};

export type LatestBriefingResult = {
  conversationId: string;
  briefingDate: string;
  briefingPackage: BriefingPackage;
  summary: BriefingDailySummary | null;
} | null;

// ─── Kaydetme ─────────────────────────────────────────────────────────────────

export async function storeDailyBriefing(
  input: StoreDailyBriefingInput,
): Promise<StoreDailyBriefingResult> {
  const { organizationId, briefingPackage, summary, executiveDailyBriefingV2 } = input;
  const briefingDate = briefingPackage.briefingDate;

  // Duplicate kontrolü: aynı gün aynı org için conversation var mı?
  const existing = await findBriefingConversationByDate(organizationId, briefingDate);

  if (existing) {
    const existingMessage = await findLastAiMessageByConversation(existing.id);
    return {
      conversationId: existing.id,
      messageId: existingMessage?.id ?? "",
      wasAlreadyStored: true,
    };
  }

  // Yeni BRIEFING conversation — title = briefingDate (duplicate detection için)
  const conversation = await createConversation({
    organizationId,
    title: briefingDate,
    type: "BRIEFING",
    status: "COMPLETED",
  });

  const message = await createMessage({
    conversationId: conversation.id,
    senderType: "AI",
    content: summary.executiveSummary,
    metadata: buildBriefingMetadata(briefingPackage, summary, executiveDailyBriefingV2),
  });

  return {
    conversationId: conversation.id,
    messageId: message.id,
    wasAlreadyStored: false,
  };
}

// ─── Okuma ────────────────────────────────────────────────────────────────────

export async function getLatestDailyBriefingForOrganization(
  organizationId: string,
): Promise<LatestBriefingResult> {
  try {
    const conversation = await findLatestBriefingConversation(organizationId);
    if (!conversation) return null;

    const message = await findLastAiMessageByConversation(conversation.id);
    if (!message?.metadata) return null;

    const briefingPackage = safeExtractBriefingPackage(message.metadata);
    if (!briefingPackage) return null;

    const summary = safeExtractSummary(message.metadata);

    return {
      conversationId: conversation.id,
      briefingDate: conversation.title ?? briefingPackage.briefingDate,
      briefingPackage,
      summary,
    };
  } catch {
    return null;
  }
}

// ─── Metadata Builder ─────────────────────────────────────────────────────────

function buildBriefingMetadata(
  briefingPackage: BriefingPackage,
  summary: BriefingDailySummary,
  executiveDailyBriefingV2?: ExecutiveDailyBriefingV2,
): Prisma.InputJsonObject {
  const baseMetadata: Prisma.InputJsonObject = {
    briefingPackage: briefingPackage as unknown as Prisma.InputJsonObject,
    summary: {
      date:             summary.date,
      timezone:         summary.timezone,
      criticalCount:    summary.criticalCount,
      watchCount:       summary.watchCount,
      infoCount:        summary.infoCount,
      totalSourceCount: summary.totalSourceCount,
      confidenceLevel:  summary.confidenceLevel,
      executiveSummary: summary.executiveSummary,
    },
  };

  if (executiveDailyBriefingV2) {
    return {
      ...baseMetadata,
      executiveDailyBriefingV2:
        executiveDailyBriefingV2 as unknown as Prisma.InputJsonObject,
    };
  }

  return baseMetadata;
}

// ─── Güvenli Parse ────────────────────────────────────────────────────────────

function safeExtractBriefingPackage(metadata: unknown): BriefingPackage | null {
  try {
    if (!metadata || typeof metadata !== "object") return null;
    const raw = metadata as Record<string, unknown>;
    const pkg = raw["briefingPackage"];
    if (!pkg || typeof pkg !== "object") return null;
    const p = pkg as Record<string, unknown>;

    if (
      typeof p["organizationId"] !== "string" ||
      typeof p["briefingDate"] !== "string" ||
      !Array.isArray(p["kritikItems"]) ||
      !Array.isArray(p["dikkatItems"]) ||
      !Array.isArray(p["bilgiItems"])
    ) {
      return null;
    }

    return p as unknown as BriefingPackage;
  } catch {
    return null;
  }
}

function safeExtractSummary(metadata: unknown): BriefingDailySummary | null {
  try {
    if (!metadata || typeof metadata !== "object") return null;
    const raw = metadata as Record<string, unknown>;
    const s = raw["summary"];
    if (!s || typeof s !== "object") return null;
    const summary = s as Record<string, unknown>;

    if (
      typeof summary["date"] !== "string" ||
      typeof summary["executiveSummary"] !== "string"
    ) {
      return null;
    }

    return summary as unknown as BriefingDailySummary;
  } catch {
    return null;
  }
}
