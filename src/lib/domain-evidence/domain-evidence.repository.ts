import { MemoryItemStatus } from "@prisma/client";

import { prisma } from "@/lib/core/shared/prisma";

const RECENT_LIMIT = 50;

export const domainEvidenceRepository = {
  organization: (organizationId: string) =>
    prisma.organization.findFirst({
      where: { id: organizationId },
      select: {
        id: true,
        industry: true,
        companySize: true,
        country: true,
        city: true,
        onboardingStatus: true,
        updatedAt: true,
      },
    }),

  customers: (organizationId: string) =>
    prisma.customer.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        status: true,
        currency: true,
        balanceCents: true,
        healthScore: true,
        tier: true,
        source: true,
        updatedAt: true,
      },
    }),

  customerContacts: (organizationId: string) =>
    prisma.customerContact.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        customerId: true,
        title: true,
        isPrimary: true,
        source: true,
        updatedAt: true,
      },
    }),

  customerCommercialTerms: (organizationId: string) =>
    prisma.customerCommercialTerms.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        customerId: true,
        paymentTermDays: true,
        creditLimitCents: true,
        defaultCurrency: true,
        deliveryTerm: true,
        updatedAt: true,
      },
    }),

  products: (organizationId: string) =>
    prisma.productService.findMany({
      where: { organizationId, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        type: true,
        category: true,
        unit: true,
        currency: true,
        stockBehavior: true,
        updatedAt: true,
      },
    }),

  quotes: (organizationId: string) =>
    prisma.quote.findMany({
      where: { organizationId, status: { not: "CANCELLED" } },
      orderBy: { updatedAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        customerName: true,
        title: true,
        status: true,
        amount: true,
        currency: true,
        sentAt: true,
        viewedAt: true,
        wonAt: true,
        lostAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),

  payments: (organizationId: string) =>
    prisma.payment.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        title: true,
        status: true,
        amount: true,
        paidAmount: true,
        currency: true,
        dueDate: true,
        paidAt: true,
        updatedAt: true,
      },
    }),

  collections: (organizationId: string) =>
    prisma.collectionAction.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        title: true,
        paymentId: true,
        actionType: true,
        status: true,
        source: true,
        priority: true,
        dueDate: true,
        expectedPaymentDate: true,
        createdAt: true,
        updatedAt: true,
      },
    }),

  goals: (organizationId: string) =>
    prisma.salesGoal.findMany({
      where: { organizationId, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        title: true,
        period: true,
        targetRevenueCents: true,
        targetCollectionCents: true,
        startsAt: true,
        endsAt: true,
        updatedAt: true,
      },
    }),

  executiveActions: (organizationId: string) =>
    prisma.executiveAction.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        title: true,
        reason: true,
        sourceType: true,
        priority: true,
        ownerType: true,
        status: true,
        dueDate: true,
        completedAt: true,
        outcomeStatus: true,
        updatedAt: true,
      },
    }),

  executiveDecisions: (organizationId: string) =>
    prisma.executiveDecisionRecord.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        title: true,
        rationale: true,
        actionHint: true,
        sourceType: true,
        category: true,
        priority: true,
        status: true,
        confidenceScore: true,
        decisionDate: true,
        followUpDueAt: true,
        updatedAt: true,
      },
    }),

  executiveOutcomes: (organizationId: string) =>
    prisma.executiveDecisionOutcome.findMany({
      where: { organizationId },
      orderBy: { occurredAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        decisionRecordId: true,
        outcome: true,
        summary: true,
        occurredAt: true,
      },
    }),

  verifiedCompanyMemories: (organizationId: string) =>
    prisma.memoryItem.findMany({
      where: {
        organizationId,
        status: MemoryItemStatus.ACTIVE,
        isUserConfirmed: true,
      },
      orderBy: { updatedAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        type: true,
        key: true,
        value: true,
        source: true,
        confidence: true,
        updatedAt: true,
      },
    }),
} as const;
