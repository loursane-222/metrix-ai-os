import { describe, expect, it } from "vitest";

import {
  METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS,
  buildMetrixExecutiveBackendInstructions
} from "../../src/lib/agent/metrix-executive-contract";

describe("shared METRIX executive backend contract", () => {
  it("publishes the authoritative verification and authority instructions", () => {
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("VERIFIED");
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("Actor, organization");
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("Do not claim");
  });

  it("appends trusted temporal context to the shared instructions", () => {
    expect(buildMetrixExecutiveBackendInstructions({
      timezone: "Europe/Istanbul",
      referenceTimeIso: "2026-09-13T17:30:00.000Z"
    })).toContain("2026-09-13T17:30:00.000Z");
  });

  // Regression guard: a production incident showed METRIX denying it has a
  // calendar visual right after opening one for tasks. The full chain
  // (contract -> tool registration -> capability runtime -> projection ->
  // renderer) was verified intact end-to-end; the only untested seam was
  // this shared instructions string silently losing its calendar guidance.
  // This is the single source both the text (api/metrix/route.ts) and
  // voice (live-delegation-bridge.ts) paths call through
  // runMetrixExecutiveTurn/createMetrixExecutiveAgent, so one assertion
  // here protects both surfaces from the same class of regression.
  it("keeps calendar_list/calendar_create/calendar_update capability guidance in the shared instructions", () => {
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("calendar_list");
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("calendar_create");
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("calendar_update");
  });

  // Büyük Operasyon 2: general narration discipline — Presentation carries
  // detail, narration only summarizes it. A single shared-contract
  // assertion protects both text and voice, exactly like the calendar
  // guard above.
  it("instructs METRIX not to re-read a Presentation's full detail in narration", () => {
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain(
      "baştan sona tekrar okuma"
    );
  });

  // Büyük Operasyon 2: capability honesty is a general instruction, never a
  // per-capability hardcoded denial/router — this guards that the general
  // sentence itself stays present.
  it("instructs METRIX never to falsely deny a capability it has a native tool for", () => {
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain(
      "yanlış bir capability reddi üretme"
    );
  });

  it("keeps customer_update capability guidance in the shared instructions", () => {
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("customer_update");
  });

  it("keeps receivables_summary/sales_summary financial-awareness guidance in the shared instructions", () => {
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain(
      "receivables_summary"
    );
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("sales_summary");
  });

  it("appends sales_summary period-derivation guidance to the trusted temporal context", () => {
    expect(buildMetrixExecutiveBackendInstructions({
      timezone: "Europe/Istanbul",
      referenceTimeIso: "2026-09-13T17:30:00.000Z"
    })).toContain("sales_summary");
  });

  it("keeps mail_search/mail_send capability guidance in the shared instructions", () => {
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("mail_search");
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("mail_send");
  });

  it("instructs METRIX that a connected mailbox's external calendar is part of the same calendar_list result", () => {
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain(
      "ayrı bir takvim değildir"
    );
  });

  it("keeps integration_status/integration_connect/integration_disconnect capability guidance in the shared instructions", () => {
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain(
      "integration_status"
    );
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain(
      "integration_connect"
    );
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain(
      "integration_disconnect"
    );
  });

  it("instructs METRIX never to fabricate or alter a connect URL", () => {
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain(
      "asla kendin bir\nURL uydurma"
    );
  });

  it("guides BizimHesap/secure-credential connection without ever accepting a secret in the conversation", () => {
    const instructions = METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS;

    expect(instructions).toContain("BizimHesap hesabıma\nbağlan");
    expect(instructions).toContain("BIZIMHESAP");
    expect(instructions).toContain("SECURE_CREDENTIAL");
    // Secret handling: never in chat, never spoken, never repeated.
    expect(instructions).toContain("ASLA sohbete");
    expect(instructions).toContain("sesli söylememesini");
    expect(instructions).toContain("tekrar\netme");
    // Honest guidance: only the descriptor's own path, and an unproven
    // credential is never presented as a confirmed token.
    expect(instructions).toContain("guidanceVerified\nfalse");
    expect(instructions).toContain("Menü adı, ekran adı, URL veya");
    expect(instructions).toContain("kesin bir \"token\" olarak sunma");
    expect(instructions).toContain("Zirve Express Aktarım Api Key");
    // Connection and data preparation are separate facts; no provider writeback.
    expect(instructions).toContain("SYNC_FAILED");
    expect(instructions).toContain("ayrı gerçekler");
    expect(instructions).toContain("BizimHesap'a fatura, müşteri, tahsilat, stok");
    expect(instructions).toContain("stok miktarı henüz BizimHesap'tan alınmıyor");
  });
});
