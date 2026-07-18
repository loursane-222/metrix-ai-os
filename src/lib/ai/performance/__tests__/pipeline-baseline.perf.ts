/**
 * FAZ 2 — Pipeline Baseline Measurement
 *
 * Gerçek Prisma Client ile DB'ye bağlanır, sadece READ işlemleri yapar.
 * Gateway (generateWithAiGateway) çağrılmaz — DB yazısı riski sıfır.
 *
 * Çalıştırma:
 *   NODE_OPTIONS='--env-file=.env' npx vitest run \
 *     src/lib/ai/performance/__tests__/pipeline-baseline.perf.ts \
 *     --reporter=verbose
 *
 * ⚠️  openai_request bu script'te ölçülmez (mock provider).
 *     Gerçek OpenAI latency'si prod server log'larından okunmalıdır.
 */

import { describe, it, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/core/shared/prisma";
import { buildExecutiveOperatingContext } from "@/lib/executive-operating-context";
import { buildLearningLoop } from "@/lib/learning-loop/learning-loop-orchestrator.service";
import { listActiveMemoryItemsByOrganization } from "@/lib/core/memory-items/memory-item.service";
import { buildChatExecutiveIntelligence } from "@/lib/ai/chat-executive-intelligence.adapter";
import { buildExecutiveBrainContext } from "@/lib/executive-brain/executive-brain-context-builder.service";
import { buildExecutiveAssessment } from "@/lib/executive-brain/executive-brain-assessment.service";
import { buildExecutiveCouncil } from "@/lib/executive-brain/executive-council.service";
import { buildStrategicProfile } from "@/lib/executive-brain/strategic-profile.service";
import { buildExecutiveDecisionPackage } from "@/lib/executive-brain/executive-decision-engine.service";
import { buildAIGeneralManagerBrief } from "@/lib/executive-brain/ai-general-manager-brief.service";
import { classifyConversation } from "@/lib/conversation-understanding";

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const ITERATIONS = parseInt(process.env.PERF_ITERATIONS ?? "10");

const MESSAGES = [
  "Merhaba",
  "Şirketimizin bu ayki durumu nasıl?",
  "En büyük riskimiz nedir?",
  "Müşterilerimizle ilgili ne düşünüyorsun?",
  "Nakit akışımız hakkında ne söyleyebilirsin?",
  "Satış hedeflerimize ulaşabilir miyiz?",
  "Personel durumu nasıl?",
  "Bu haftaki önceliğim ne olmalı?",
  "Tekliflerimizin durumu nasıl?",
  "Geçen aya göre nasıl gidiyoruz?",
];

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

type Stats = { avg: number; median: number; min: number; max: number; p95: number };

function stats(values: number[]): Stats {
  const s = [...values].sort((a, b) => a - b);
  const avg = Math.round(s.reduce((a, v) => a + v, 0) / s.length);
  return {
    avg,
    median: s[Math.floor(s.length / 2)],
    min: s[0],
    max: s[s.length - 1],
    p95: s[Math.floor(s.length * 0.95)],
  };
}

function pct(value: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((value / total) * 100)}%`;
}

// ─── Veri ─────────────────────────────────────────────────────────────────────

let organizationId = "";

const raw: Record<string, number[]> = {
  learning_loop: [],
  active_memory_fetch: [],
  executive_brain: [],
  executive_intelligence: [],
  operating_context: [],
};

// ─── Test ─────────────────────────────────────────────────────────────────────

describe("FAZ 2 — Pipeline Baseline (read-only)", () => {
  beforeAll(async () => {
    // Prisma Client ile (raw SQL değil) ilk organizasyonu bul
    const org = await prisma.organization.findFirst({
      select: { id: true, name: true },
    });

    if (!org) {
      throw new Error(
        "Veritabanında organization bulunamadı. " +
          "DATABASE_URL doğru mu? NODE_OPTIONS='--env-file=.env' ile çalıştırıldı mı?",
      );
    }

    organizationId = org.id;
    console.info(`\n  ✦ Ölçüm için organization: "${org.name}" (${org.id.slice(0, 8)}…)`);
    console.info(`  ✦ İterasyon sayısı: ${ITERATIONS}\n`);
  }, 10_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it(
    "katman ölçümleri",
    async () => {
      for (let i = 0; i < ITERATIONS; i++) {
        const msg = MESSAGES[i % MESSAGES.length];
        const now = new Date().toISOString();
        process.stdout.write(`  [${i + 1}/${ITERATIONS}] "${msg.slice(0, 35)}"…`);

        // ── learning_loop ──────────────────────────────────────────────────────
        {
          const t = performance.now();
          await buildLearningLoop({ organizationId });
          raw.learning_loop.push(Math.round(performance.now() - t));
        }

        // ── active_memory_fetch ────────────────────────────────────────────────
        {
          const t = performance.now();
          await listActiveMemoryItemsByOrganization(organizationId);
          raw.active_memory_fetch.push(Math.round(performance.now() - t));
        }

        // ── executive_brain (4 DB okuma + sync builder zinciri) ───────────────
        {
          const t = performance.now();
          const ctx = await buildExecutiveBrainContext({ organizationId, now });
          const asmnt = buildExecutiveAssessment(ctx);
          const council = buildExecutiveCouncil(ctx, asmnt);
          const profile = buildStrategicProfile(ctx);
          const pkg = buildExecutiveDecisionPackage(ctx, asmnt, council, profile);
          buildAIGeneralManagerBrief({
            context: ctx,
            assessment: asmnt,
            council,
            strategicProfile: profile,
            decisionPackage: pkg,
          });
          raw.executive_brain.push(Math.round(performance.now() - t));
        }

        // ── executive_intelligence (memory DB + EOS sync) ─────────────────────
        {
          const t = performance.now();
          const understanding = await classifyConversation({ message: msg });
          await buildChatExecutiveIntelligence({
            organizationId,
            message: msg,
            generatedAt: now,
            understanding,
          });
          raw.executive_intelligence.push(Math.round(performance.now() - t));
        }

        // ── operating_context (10+ paralel DB okuma + sync) ──────────────────
        {
          const t = performance.now();
          await buildExecutiveOperatingContext({
            organizationId,
            mode: "CHAT",
            writePolicy: {
              // Üretim DB'sine yazı YOK — sadece okuma
              syncCollectionActions: false,
              writeSignalSnapshot: false,
              writeDecisionRecords: false,
              syncPriorityActions: false,
            },
          });
          raw.operating_context.push(Math.round(performance.now() - t));
        }

        process.stdout.write(
          `  ll=${raw.learning_loop[i]}ms  mem=${raw.active_memory_fetch[i]}ms` +
            `  brain=${raw.executive_brain[i]}ms  intel=${raw.executive_intelligence[i]}ms` +
            `  oc=${raw.operating_context[i]}ms\n`,
        );

        // Kısa nefes — aynı anda çok bağlantı açılmasın
        await new Promise((r) => setTimeout(r, 150));
      }

      // ── İstatistik ──────────────────────────────────────────────────────────
      const s: Record<string, Stats> = {};
      for (const [k, v] of Object.entries(raw)) s[k] = stats(v);

      console.info("\n\n══════════════════════════════════════════════════════════════════");
      console.info("  KATMAN BAZLI İSTATİSTİK (ms)");
      console.info("══════════════════════════════════════════════════════════════════");
      console.table(
        Object.entries(s).map(([k, v]) => ({
          katman: k,
          "avg ms": v.avg,
          "median ms": v.median,
          "min ms": v.min,
          "max ms": v.max,
          "p95 ms": v.p95,
        })),
      );

      // ── 10 Request Tablosu ──────────────────────────────────────────────────
      console.info("\n══════════════════════════════════════════════════════════════════");
      console.info("  10 REQUEST — HAM VERİ (ms)");
      console.info("══════════════════════════════════════════════════════════════════");
      const rows = Array.from({ length: ITERATIONS }, (_, i) => ({
        "#": i + 1,
        ll: raw.learning_loop[i],
        mem: raw.active_memory_fetch[i],
        brain: raw.executive_brain[i],
        intel: raw.executive_intelligence[i],
        oc: raw.operating_context[i],
        // Tahmini route_total (openai hariç):
        "~route (no openai)":
          raw.learning_loop[i] +
          raw.active_memory_fetch[i] +
          raw.executive_brain[i] +
          raw.executive_intelligence[i] +
          raw.operating_context[i],
      }));
      console.table(rows);

      // ── Dağılım ─────────────────────────────────────────────────────────────
      const dbTotal =
        s.learning_loop.avg +
        s.active_memory_fetch.avg +
        s.executive_brain.avg +
        s.executive_intelligence.avg +
        s.operating_context.avg;

      console.info("\n══════════════════════════════════════════════════════════════════");
      console.info("  KATMAN DAĞILIMI (avg, OpenAI hariç)");
      console.info("══════════════════════════════════════════════════════════════════");
      console.table(
        [
          { katman: "operating_context", "avg ms": s.operating_context.avg, "% (DB+proc)": pct(s.operating_context.avg, dbTotal) },
          { katman: "executive_brain", "avg ms": s.executive_brain.avg, "% (DB+proc)": pct(s.executive_brain.avg, dbTotal) },
          { katman: "executive_intelligence", "avg ms": s.executive_intelligence.avg, "% (DB+proc)": pct(s.executive_intelligence.avg, dbTotal) },
          { katman: "learning_loop", "avg ms": s.learning_loop.avg, "% (DB+proc)": pct(s.learning_loop.avg, dbTotal) },
          { katman: "active_memory_fetch", "avg ms": s.active_memory_fetch.avg, "% (DB+proc)": pct(s.active_memory_fetch.avg, dbTotal) },
        ].sort((a, b) => b["avg ms"] - a["avg ms"]),
      );

      // ── En Pahalı 5 ─────────────────────────────────────────────────────────
      console.info("\n══════════════════════════════════════════════════════════════════");
      console.info("  EN PAHALI 5 KATMAN");
      console.info("══════════════════════════════════════════════════════════════════");
      const top5 = Object.entries(s)
        .sort((a, b) => b[1].avg - a[1].avg)
        .slice(0, 5)
        .map(([k, v], i) => ({ rank: i + 1, katman: k, "avg ms": v.avg, "p95 ms": v.p95 }));
      console.table(top5);

      console.info("\n  ⚠️  'openai_request' bu ölçümde mevcut değil (AI_PROVIDER set edilmemiş = mock).");
      console.info("      Gerçek OpenAI süresi production PERF log'larından okunmalıdır.");
      console.info("      Gerçek route_total = (bu ölçümlerin toplamı) + openai_request + diğer yazılar.\n");
    },
    180_000, // 3 dakika timeout
  );
});
