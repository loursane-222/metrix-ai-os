import { describe, expect, it } from "vitest";

import { detectExecutiveActionOutcomeSignals } from "../executive-action-outcome-capture.service";

const openAction = {
  id: "action-1",
  title: "[ABC] Tahsilat sonucunu netleştir",
  reason: "ABC ödemesini takip et",
};

function detect(message: string) {
  return detectExecutiveActionOutcomeSignals({
    message,
    openActions: [openAction],
  });
}

describe("detectExecutiveActionOutcomeSignals completion authority", () => {
  it.each([
    "ABC cuma ödeyecek.",
    "ABC ödeme sözü verdi.",
    "ABC yarın geri dönecek.",
    "ABC'den haber bekliyoruz.",
    "ABC cuma gelecek.",
    "ABC şu an bekliyor.",
  ])("does not produce a completion signal for a partial outcome: %s", (message) => {
    expect(detect(message)).toEqual([]);
  });

  it("preserves SUCCESS completion signals", () => {
    expect(detect("ABC teklifini kabul etti.")).toMatchObject([
      {
        actionId: openAction.id,
        outcomeStatus: "SUCCESS",
      },
    ]);
  });

  it("preserves terminal FAILURE completion signals", () => {
    expect(detect("ABC teklifi reddetti.")).toMatchObject([
      {
        actionId: openAction.id,
        outcomeStatus: "FAILED",
      },
    ]);
  });

  it("preserves UNKNOWN signals for completed activity without a terminal outcome", () => {
    expect(detect("ABC için müşteriyi aradım.")).toMatchObject([
      {
        actionId: openAction.id,
        outcomeStatus: "UNKNOWN",
      },
    ]);
  });

  it("preserves the ambiguity guard for terminal outcomes", () => {
    expect(
      detectExecutiveActionOutcomeSignals({
        message: "ABC ve DEF tekliflerini kabul etti.",
        openActions: [
          openAction,
          {
            id: "action-2",
            title: "[DEF] Teklif sonucunu netleştir",
            reason: "DEF teklifini takip et",
          },
        ],
      }),
    ).toEqual([]);
  });
});
