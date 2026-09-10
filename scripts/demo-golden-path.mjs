#!/usr/bin/env node
// METRIX Demo Golden Path — one bounded pre-demo acceptance check.
//
// Answers: "METRIX bugün demo-safe mi?" Reuses the real canonical runtime
// (the actual /api/ai/chat endpoint on the deployed production build) —
// no parallel fake METRIX, no simulated scoring.
//
// Usage:
//   node scripts/demo-golden-path.mjs
//   METRIX_SESSION_COOKIE="metrix_session=..." node scripts/demo-golden-path.mjs
//
// Without METRIX_SESSION_COOKIE, only the unauthenticated reachability
// check runs; every conversational scenario is reported as
// NEEDS USER ACCEPTANCE rather than fabricating a result. To get the
// cookie: log into metrixgm.com in a browser, open devtools > Application
// > Cookies, copy the "metrix_session" value.
//
// This never touches real customer/company data — every mutation
// scenario uses a title prefixed "DEMO TEST", matching the convention
// already used in prior live acceptance passes.

const BASE_URL = process.env.METRIX_GOLDEN_PATH_BASE_URL ?? "https://metrixgm.com";
const SESSION_COOKIE = process.env.METRIX_SESSION_COOKIE ?? null;
const FIRST_REACTION_TARGET_MS = 1000;
const FIRST_REACTION_CEILING_MS = 1500;

/** @typedef {{ id: string, category: string, message: string, kind: "auto"|"manual"|"hardware", notes: string }} Scenario */

/** @type {Scenario[]} */
const SCENARIOS = [
  { id: 1, category: "CONVERSATION", message: "Merhaba", kind: "auto", notes: "greeting" },
  { id: 2, category: "CONVERSATION", message: "Bugün hava nasıl olur dersin?", kind: "auto", notes: "simple general question, no company data" },
  { id: 3, category: "CONVERSATION", message: "Peki bunu nasıl değerlendirmeliyim?", kind: "auto", notes: "conversational follow-up (context-dependent, low-risk if it needs a clarification)" },
  { id: 4, category: "EXECUTIVE / COMPANY TRUTH", message: "Şirketimizin genel durumu nasıl?", kind: "auto", notes: "company status" },
  { id: 5, category: "EXECUTIVE / COMPANY TRUTH", message: "Nakit durumumuz nasıl?", kind: "auto", notes: "finance/cash — known slow class, verify explained-wait behavior manually in the transcript" },
  { id: 6, category: "EXECUTIVE / COMPANY TRUTH", message: "Satış hattımızda öne çıkan bir şey var mı?", kind: "auto", notes: "sales/pipeline" },
  { id: 7, category: "EXECUTIVE / COMPANY TRUTH", message: "Hangi müşterilerle ilgilenmem gerekiyor?", kind: "auto", notes: "customer health" },
  { id: 8, category: "EXECUTIVE / COMPANY TRUTH", message: "Bu ay şirket için en büyük risk ne?", kind: "auto", notes: "cross-domain Executive judgment" },
  { id: 9, category: "CUSTOMER", message: "Müşterilerimizden birini bul: en son eklenen kim?", kind: "auto", notes: "find/open customer, read-only" },
  { id: 10, category: "CUSTOMER", message: "DEMO TEST müşteri diye bir kayıt var mı, yoksa oluşturmadan önce sorayım", kind: "manual", notes: "customer create/update is a real mutation on a shared table — review before running; not auto-executed by this script" },
  { id: 11, category: "TASK / CALENDAR", message: 'DEMO TEST: Yarın için "Golden path görevi - silinebilir" başlıklı bir görev oluştur.', kind: "auto", notes: "create task tomorrow" },
  { id: 12, category: "TASK / CALENDAR", message: 'DEMO TEST: "Golden path yüksek öncelik - silinebilir" başlıklı, yüksek öncelikli, 3 gün sonrası için bir görev oluştur.', kind: "auto", notes: "dated, high-priority task" },
  { id: 13, category: "TASK / CALENDAR", message: 'DEMO TEST: "Golden path atama - silinebilir" başlıklı bir görev oluştur ve bunu bana ata.', kind: "auto", notes: "self-assignment — regression check for the resolved self-reference bug" },
  { id: 14, category: "TASK / CALENDAR", message: '"Golden path" ile başlayan görevleri listele.', kind: "auto", notes: "retrieve/read the tasks just created — mutation readback" },
  { id: 15, category: "COMMERCIAL ACTION", message: "Teklif oluşturma sürecini nasıl başlatırım?", kind: "manual", notes: "offer-related — real teklif/invoice/tahsilat creation left to manual review, not auto-executed" },
  { id: 16, category: "COMMERCIAL ACTION", message: "Fatura oluşturmak istersem ne bilmen gerekiyor?", kind: "manual", notes: "invoice-related — same reasoning as #15" },
  { id: 17, category: "COMMERCIAL ACTION", message: "Bir tahsilat kaydı girmek istersem hangi bilgiler lazım?", kind: "manual", notes: "settlement/tahsilat — same reasoning as #15" },
  { id: 18, category: "EXTERNAL", message: "Dolar kuru şu an ne kadar?", kind: "auto", notes: "external evidence request — must not fabricate a rate before real evidence arrives" },
  { id: 19, category: "VOICE", message: null, kind: "hardware", notes: "simple voice turn — needs a live microphone/browser session, see 30-second manual pre-demo check" },
  { id: 20, category: "VOICE", message: null, kind: "hardware", notes: "voice action request — same as #19" },
];

async function checkReachability() {
  const startedAt = Date.now();
  try {
    const res = await fetch(BASE_URL, { method: "GET", redirect: "follow" });
    return { ok: res.ok, status: res.status, ms: Date.now() - startedAt };
  } catch (error) {
    return { ok: false, status: null, ms: Date.now() - startedAt, error: String(error) };
  }
}

/** Runs one scenario against the real /api/ai/chat endpoint, reading the NDJSON stream. */
async function runScenario(scenario) {
  const startedAt = Date.now();
  let firstChunkAtMs = null;
  let finalText = "";
  let sawError = false;
  try {
    const res = await fetch(`${BASE_URL}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: SESSION_COOKIE },
      body: JSON.stringify({ message: scenario.message }),
    });
    if (!res.ok || !res.body) {
      return { ...scenario, result: "FAIL", detail: `HTTP ${res.status}`, firstReactionMs: null, totalMs: Date.now() - startedAt };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (!line.trim()) continue;
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        if (event.type === "chunk" && typeof event.content === "string") {
          if (firstChunkAtMs === null) firstChunkAtMs = Date.now() - startedAt;
          finalText += event.content;
        }
        if (event.type === "error") sawError = true;
      }
    }
  } catch (error) {
    return { ...scenario, result: "FAIL", detail: String(error), firstReactionMs: null, totalMs: Date.now() - startedAt };
  }
  const totalMs = Date.now() - startedAt;
  if (sawError || !finalText.trim()) {
    return { ...scenario, result: "FAIL", detail: sawError ? "stream reported an error" : "empty response", firstReactionMs: firstChunkAtMs, totalMs };
  }
  const reactionVerdict = firstChunkAtMs === null ? "UNKNOWN"
    : firstChunkAtMs <= FIRST_REACTION_TARGET_MS ? "PASS"
    : firstChunkAtMs <= FIRST_REACTION_CEILING_MS ? "PASS (over target, within ceiling)"
    : "SLOW (over hard ceiling)";
  return { ...scenario, result: "PASS", detail: reactionVerdict, firstReactionMs: firstChunkAtMs, totalMs, preview: finalText.slice(0, 140) };
}

async function main() {
  console.log(`METRIX DEMO GOLDEN PATH — ${new Date().toISOString()}`);
  console.log(`Target: ${BASE_URL}\n`);

  const reachability = await checkReachability();
  console.log(`[reachability] ${reachability.ok ? "OK" : "FAIL"} (status=${reachability.status}, ${reachability.ms}ms)`);
  if (!reachability.ok) {
    console.log("\nMETRIX DEMO GOLDEN PATH RESULT: DEMO BLOCKED — metrixgm.com is not reachable.");
    process.exit(1);
  }

  if (!SESSION_COOKIE) {
    console.log("\nNo METRIX_SESSION_COOKIE provided — every conversational/action scenario is NEEDS USER ACCEPTANCE.");
    console.log("Log into metrixgm.com, copy the metrix_session cookie value, and re-run with:");
    console.log('  METRIX_SESSION_COOKIE="metrix_session=<value>" node scripts/demo-golden-path.mjs\n');
    for (const scenario of SCENARIOS) {
      console.log(`  [${scenario.category}] #${scenario.id} — NEEDS USER ACCEPTANCE (${scenario.kind}) — ${scenario.notes}`);
    }
    console.log("\nMETRIX DEMO GOLDEN PATH RESULT: NEEDS USER ACCEPTANCE (no session — reachability only was checked automatically).");
    return;
  }

  const results = [];
  for (const scenario of SCENARIOS) {
    if (scenario.kind === "hardware") {
      console.log(`  [${scenario.category}] #${scenario.id} — USER ACCEPTANCE REQUIRED (hardware) — ${scenario.notes}`);
      results.push({ ...scenario, result: "USER_ACCEPTANCE_REQUIRED" });
      continue;
    }
    if (scenario.kind === "manual") {
      console.log(`  [${scenario.category}] #${scenario.id} — NOT AUTO-EXECUTED (manual review) — ${scenario.notes}`);
      results.push({ ...scenario, result: "MANUAL_REVIEW" });
      continue;
    }
    const outcome = await runScenario(scenario);
    results.push(outcome);
    const timing = outcome.firstReactionMs === null ? "no reaction observed" : `first reaction ${outcome.firstReactionMs}ms`;
    console.log(`  [${scenario.category}] #${scenario.id} — ${outcome.result} (${timing}, total ${outcome.totalMs}ms) — ${outcome.detail}`);
  }

  const failed = results.filter((r) => r.result === "FAIL");
  const slow = results.filter((r) => r.result === "PASS" && typeof r.firstReactionMs === "number" && r.firstReactionMs > FIRST_REACTION_CEILING_MS);
  const needsReview = results.filter((r) => r.result === "MANUAL_REVIEW" || r.result === "USER_ACCEPTANCE_REQUIRED");

  console.log(`\nSummary: ${results.length} scenarios — ${results.filter((r) => r.result === "PASS").length} passed, ${failed.length} failed, ${needsReview.length} need manual/hardware review.`);
  if (slow.length > 0) console.log(`Slow first reaction (>${FIRST_REACTION_CEILING_MS}ms): ${slow.map((r) => `#${r.id}`).join(", ")}`);

  let verdict = "DEMO READY";
  if (failed.length > 0) verdict = "DEMO BLOCKED";
  else if (needsReview.length > 0 || slow.length > 0) verdict = "NEEDS USER ACCEPTANCE";

  console.log(`\nMETRIX DEMO GOLDEN PATH RESULT: ${verdict}`);
  if (verdict === "DEMO BLOCKED") process.exit(1);
}

main();
