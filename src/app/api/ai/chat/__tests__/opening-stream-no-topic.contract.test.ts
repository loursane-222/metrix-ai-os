import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/app/api/ai/chat/route.ts"), "utf8");

// Regression: createMetrixOpeningStream's prompt used to unconditionally
// demand "a 3-7 word sentence naming the concrete topic in the user's
// message" with no instruction for turns that have no concrete topic
// (greetings, small talk). Reproduced live: on a warm greeting, the model
// had nothing to name, so it narrated the conversational act itself
// ("kullanıcı sıcak bir şekilde merhaba dedi, şimdi samimi şekilde cevap
// veriyorum") instead. This opening phase is spoken/shown live (both
// voice and text — MetrixChatTab.tsx treats every "chunk" event the same
// regardless of phase) but is NEVER part of the final persisted aiContent
// (route.ts only builds aiContent from the primary stream) — so the
// fabricated narration got spoken/displayed once, then silently vanished
// once the real answer replaced it. Fixed by giving the model an explicit,
// correct instruction for the no-topic case: produce nothing at all,
// rather than inventing a substitute narrating its own reasoning.
describe("opening stream — no-topic turns", () => {
  it("instructs the model to produce nothing (not narrate the user's tone/intent) when there is no concrete business topic", () => {
    const promptStart = source.indexOf("AYNI TURUN DİNAMİK AÇILIŞ PARÇASI");
    expect(promptStart).toBeGreaterThan(0);
    const promptEnd = source.indexOf("].join(\"\\n\");", promptStart);
    const promptBody = source.slice(promptStart, promptEnd);

    expect(promptBody).toContain("HİÇBİR ŞEY üretme, tamamen boş çıktı ver");
    expect(promptBody).toContain("kendi iç muhakemeni kullanıcıya anlatmak olur, kesinlikle yasak");
  });
});
