import { describe, expect, it } from "vitest";
import { buildUnconfirmedMutationIntentMessage } from "../conversation-extension-handoff-message";

// Living Workspace Determinism Operation — Gap 2: no conversation extension
// claimed this turn (no handoff at all), yet the turn still looks
// record-mutation-shaped. These tests prove the gate is evidence-based
// (real handoff presence, existing conversation-understanding fields) and
// never content-scans the model's own generated text.
describe("buildUnconfirmedMutationIntentMessage", () => {
  it("blocks an unconfirmed mutation claim when business-navigation explicitly resolved a create-with-Surface domain (test B: disagreement)", () => {
    const message = buildUnconfirmedMutationIntentMessage({
      hasHandoff: false,
      userMotivation: "bilgi_almak",
      shouldInvokeExecutiveBrain: true,
      mutationSurfaceResolved: true,
    });
    expect(message).not.toBeNull();
  });

  it("blocks an unconfirmed mutation claim for any domain via userMotivation alone, with no MUTATION_SURFACE_RESOLVED evidence required (test E, Task/Invoice)", () => {
    const message = buildUnconfirmedMutationIntentMessage({
      hasHandoff: false,
      userMotivation: "kayit_islem",
      shouldInvokeExecutiveBrain: true,
      mutationSurfaceResolved: false,
    });
    expect(message).not.toBeNull();
    expect(message).not.toMatch(/olu[şs]turdum|kaydettim|tamamladım|g[öo]nderdim/iu);
  });

  it("never fires when a real handoff exists, regardless of other signals (test F: real success preserved)", () => {
    expect(buildUnconfirmedMutationIntentMessage({
      hasHandoff: true,
      userMotivation: "kayit_islem",
      shouldInvokeExecutiveBrain: true,
      mutationSurfaceResolved: true,
    })).toBeNull();
  });

  it("never fires for read-intent turns (test G: 'Atlas'ın telefonu nedir?' must not be treated as mutation)", () => {
    expect(buildUnconfirmedMutationIntentMessage({
      hasHandoff: false,
      userMotivation: "bilgi_almak",
      shouldInvokeExecutiveBrain: true,
      mutationSurfaceResolved: false,
    })).toBeNull();
  });

  it("never fires for general chat, even if userMotivation happens to read as kayit_islem", () => {
    expect(buildUnconfirmedMutationIntentMessage({
      hasHandoff: false,
      userMotivation: "kayit_islem",
      shouldInvokeExecutiveBrain: false,
      mutationSurfaceResolved: false,
    })).toBeNull();
  });

  it("returns an honest, non-fabricating message rather than empty content", () => {
    const message = buildUnconfirmedMutationIntentMessage({
      hasHandoff: false,
      userMotivation: "kayit_islem",
      shouldInvokeExecutiveBrain: true,
      mutationSurfaceResolved: false,
    });
    expect(message).toBeTruthy();
    expect(message).not.toMatch(/yetkim|erişimim|erisimim/iu);
  });
});
