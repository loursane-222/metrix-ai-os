import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

const baseUrl = process.env.PRODUCTION_BASE_URL ?? "https://metrixgm.com";
const mode = process.env.ACCEPTANCE_MODE ?? "full";
const suffix = randomUUID().slice(0, 8);
let organizationId = "";
let userId = "";
let sessionToken = "";
let customerId = "";
const turnTimings: Array<{ firstByteMs: number; totalMs: number }> = [];

describe(`Executive Business Reality production acceptance (${mode})`, () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        phone: `acceptance-${suffix}@metrix.invalid`,
        fullName: "METRIX Production Acceptance",
      },
    });
    userId = user.id;
    const organization = await prisma.organization.create({
      data: {
        name: `ACCEPTANCE Executive Reality ${suffix}`,
        description: "Temporary production acceptance organization",
      },
    });
    organizationId = organization.id;
    await prisma.organizationMember.create({
      data: { organizationId, userId, role: "OWNER" },
    });
    sessionToken = (await createSession(userId, false)).token;
    if (mode === "full") {
      const customer = await prisma.customer.create({
        data: {
          organizationId,
          displayName: `Atlas Acceptance ${suffix}`,
          currency: "TRY",
          source: "ACCEPTANCE",
        },
      });
      customerId = customer.id;
      await prisma.customerCommercialTerms.create({
        data: {
          organizationId,
          customerId,
          defaultCurrency: "TRY",
          paymentTermDays: 30,
          notes: `production-acceptance:${suffix}`,
        },
      });
    }
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } })
        .catch(() => undefined);
    }
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("uses a real authenticated production session and records turn latency", async () => {
    const me = await api("/api/auth/me");
    expect(me.response.status).toBe(200);
    expect((me.json as { data?: { user?: { id?: string } } }).data?.user?.id).toBe(userId);

    const messages = mode === "baseline"
      ? [
          "Diyelim ki nakit akışım bozuldu.",
          "Bu yalnız bir varsayım: iş değişti diyelim.",
          "Sadece sohbet ediyoruz, kayıt oluşturma.",
          "Tarih, vision ve business kelimeleri üzerine bir espri yap.",
          "Bir karar senaryosu hayal edelim.",
        ]
      : ["Diyelim ki nakit akışım bozuldu."];
    for (const message of messages) await chat(message, "text");
    expect(turnTimings).toHaveLength(messages.length);
    console.info("PRODUCTION_TURN_TIMINGS", {
      mode,
      turns: turnTimings,
      firstByteP95: p95(turnTimings.map((item) => item.firstByteMs)),
      totalP95: p95(turnTimings.map((item) => item.totalMs)),
    });
  });

  it.skipIf(mode !== "full")("isolates Event, hypothetical, false-positive and AI text", async () => {
    const ghostName = `Ghost Customer ${suffix}`;
    const eventIds: string[] = [];
    for (let index = 0; index < 200; index += 1) {
      const event = await prisma.event.create({
        data: {
          organizationId,
          actorUserId: userId,
          eventType: "USER_MESSAGE_CREATED",
          entityType: "Conversation",
          payload: { contentPreview: `${ghostName} business decision history vision operation is` },
          source: "USER",
        },
      });
      eventIds.push(event.id);
    }
    const ghostTurn = await chat(`${ghostName} kayıtlı müşterimiz mi?`, "text");
    await chat("is operation business decision history vision kelimeleriyle ilgisiz bir espri yap.", "text");
    const trace = await latestTrace(ghostTurn.conversationId);
    const accepted = traceAcceptedEvidence(trace.traceJson);
    expect(accepted.some((item) => eventIds.includes(item.evidenceId))).toBe(false);
    expect(await prisma.customer.count({
      where: { organizationId, displayName: ghostName },
    })).toBe(0);
    expect(await candidatesForConversation(ghostTurn.conversationId)).toHaveLength(0);
    const aiMessageIds = (await prisma.message.findMany({
      where: { conversationId: ghostTurn.conversationId, senderType: "AI" },
      select: { id: true },
    })).map((item) => item.id);
    expect(await prisma.businessCandidate.count({
      where: { organizationId, sourceMessageId: { in: aiMessageIds } },
    })).toBe(0);
  });

  it.skipIf(mode !== "full")("executes single-field approval and canonical promotion", async () => {
    const turn = await chat(`Atlas Acceptance ${suffix} artık euro ile çalışıyor.`, "text");
    const [candidate] = await waitForCandidates(turn.conversationId, 1);
    const before = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(before.currency).toBe("TRY");
    const result = await api(`/api/business-candidates/${candidate!.id}/decision`, {
      method: "POST",
      body: { approveAll: true },
    });
    expect(result.response.status).toBe(200);
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(after.currency).toBe("EUR");
    expect(await prisma.businessCandidatePromotionReceipt.count({
      where: { organizationId, candidateId: candidate!.id, status: "SUCCEEDED" },
    })).toBe(1);
  });

  it.skipIf(mode !== "full")("supports multi-field partial approval in the canonical database", async () => {
    await prisma.customer.update({
      where: { id: customerId },
      data: { currency: "TRY" },
    });
    const turn = await chat(
      `Atlas Acceptance ${suffix} artık euro ile çalışıyor ve vadesi 45 gün.`,
      "text",
    );
    const candidates = await waitForCandidates(turn.conversationId, 1);
    const candidate = candidates.find((item) => item.changes.length >= 2);
    expect(candidate).toBeTruthy();
    const currency = candidate!.changes.find((change) =>
      change.fieldPath.includes("Currency") || change.fieldPath === "currency"
    );
    const term = candidate!.changes.find((change) =>
      change.fieldPath.includes("paymentTermDays")
    );
    expect(currency).toBeTruthy();
    expect(term).toBeTruthy();
    const result = await api(`/api/business-candidates/${candidate!.id}/decision`, {
      method: "POST",
      body: {
        approvedChangeIds: [currency!.id],
        rejectedChangeIds: [term!.id],
      },
    });
    expect(result.response.status).toBe(200);
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    const terms = await prisma.customerCommercialTerms.findUniqueOrThrow({
      where: { customerId },
    });
    expect(customer.currency === "EUR" || terms.defaultCurrency === "EUR").toBe(true);
    expect(terms.paymentTermDays).toBe(30);
    const receipt = await prisma.businessCandidatePromotionReceipt.findFirstOrThrow({
      where: { organizationId, candidateId: candidate!.id },
    });
    expect(receipt.approvedChangeIds).toEqual([currency!.id]);
  });

  it.skipIf(mode !== "full")("splits and promotes the required multi-domain command", async () => {
    const turn = await chat(
      `Atlas Acceptance ${suffix}'ın vadesini 45 güne çıkar, Granit X ${suffix}'i ürünlere ekle ve yarın Ahmet'i ara.`,
      "voice",
    );
    const candidates = await waitForCandidates(turn.conversationId, 3);
    expect(new Set(candidates.map((item) => item.targetDomain))).toEqual(new Set([
      "CustomerCommercialTerms",
      "ProductService",
      "ExecutiveAction",
    ]));
    for (const candidate of candidates) {
      const result = await api(`/api/business-candidates/${candidate.id}/decision`, {
        method: "POST",
        body: { approveAll: true },
      });
      expect(result.response.status).toBe(200);
    }
    expect(await prisma.productService.count({
      where: { organizationId, name: `Granit X ${suffix}` },
    })).toBe(1);
    expect(await prisma.executiveAction.count({
      where: { organizationId, title: { contains: "Ahmet" } },
    })).toBeGreaterThanOrEqual(1);
    const trace = await latestTrace(turn.conversationId);
    const summary = traceCandidateSummary(trace.traceJson);
    expect(summary.propositionIds.length).toBeGreaterThanOrEqual(3);
    expect(trace.channel).toBe("voice");
  });

  it.skipIf(mode !== "full")("rejects a candidate without canonical mutation", async () => {
    const before = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    const turn = await chat(`Atlas Acceptance ${suffix} dolar ile çalışıyor.`, "text");
    const [candidate] = await waitForCandidates(turn.conversationId, 1);
    const result = await api(`/api/business-candidates/${candidate!.id}/decision`, {
      method: "POST",
      body: { rejectAll: true },
    });
    expect(result.response.status).toBe(200);
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(after.currency).toBe(before.currency);
    expect(await prisma.businessCandidatePromotionReceipt.count({
      where: { organizationId, candidateId: candidate!.id },
    })).toBe(0);
  });

  it.skipIf(mode !== "full")("keeps text and voice semantic extraction equivalent", async () => {
    const message = `Atlas Acceptance ${suffix}'ın vadesini 50 güne çıkar.`;
    const text = await chat(message, "text");
    const voice = await chat(message, "voice");
    const [textCandidate] = await waitForCandidates(text.conversationId, 1);
    const [voiceCandidate] = await waitForCandidates(voice.conversationId, 1);
    expect({
      domain: textCandidate!.targetDomain,
      operation: textCandidate!.operation,
      changes: textCandidate!.changes.map((item) => ({
        fieldPath: item.fieldPath,
        proposedValue: item.proposedValue,
      })),
    }).toEqual({
      domain: voiceCandidate!.targetDomain,
      operation: voiceCandidate!.operation,
      changes: voiceCandidate!.changes.map((item) => ({
        fieldPath: item.fieldPath,
        proposedValue: item.proposedValue,
      })),
    });
  });
});

async function chat(message: string, channel: "text" | "voice") {
  const started = performance.now();
  const response = await fetch(`${baseUrl}/api/ai/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `metrix_session=${sessionToken}`,
      "X-Metrix-Channel": channel,
      "X-Correlation-Id": `acceptance-${suffix}-${randomUUID().slice(0, 8)}`,
    },
    body: JSON.stringify({ message }),
  });
  const firstByteMs = Math.round(performance.now() - started);
  const text = await response.text();
  const totalMs = Math.round(performance.now() - started);
  turnTimings.push({ firstByteMs, totalMs });
  expect(response.status, text.slice(0, 500)).toBe(200);
  const events = text.trim().split("\n").map((line) => JSON.parse(line));
  const done = events.find((event) => event.type === "done");
  expect(done).toBeTruthy();
  return { conversationId: String(done.conversationId), events };
}

async function api(path: string, input?: { method: string; body: unknown }) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: input?.method ?? "GET",
    headers: {
      cookie: `metrix_session=${sessionToken}`,
      ...(input ? { "content-type": "application/json" } : {}),
    },
    ...(input ? { body: JSON.stringify(input.body) } : {}),
  });
  const json = await response.json();
  return { response, json };
}

async function waitForCandidates(conversationId: string, minimum: number) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidates = await candidatesForConversation(conversationId);
    if (candidates.length >= minimum) return candidates;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return candidatesForConversation(conversationId);
}

function candidatesForConversation(conversationId: string) {
  return prisma.businessCandidate.findMany({
    where: { organizationId, conversationId },
    include: { changes: true, promotionReceipts: true },
    orderBy: { createdAt: "asc" },
  });
}

function latestTrace(conversationId: string) {
  return prisma.executiveRuntimeTraceRecord.findFirstOrThrow({
    where: { organizationId, conversationId },
    orderBy: { createdAt: "desc" },
  });
}

function traceAcceptedEvidence(value: unknown): Array<{ evidenceId: string }> {
  if (!isObject(value) || !isObject(value.managementPictureSummary)) return [];
  const accepted = value.managementPictureSummary.acceptedEvidence;
  return Array.isArray(accepted) ? accepted.filter(isObject) as Array<{ evidenceId: string }> : [];
}

function traceCandidateSummary(value: unknown): {
  propositionIds: string[];
  changeIds: string[];
} {
  if (!isObject(value) || !isObject(value.candidateSummary)) {
    return { propositionIds: [], changeIds: [] };
  }
  return {
    propositionIds: stringArray(value.candidateSummary.propositionIds),
    changeIds: stringArray(value.candidateSummary.changeIds),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function p95(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}
