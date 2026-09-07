import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const route = readFileSync(new URL("../route.ts", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../../../../../lib/executive-agent/runtime.ts", import.meta.url), "utf8");
describe("one progressive conversation lifecycle", () => {
  it("entry uses the actual message, no evidence and no fixed acknowledgement list", () => {
    const opening = route.slice(route.indexOf("function createMetrixOpeningStream"), route.indexOf("function validateActiveDocumentAttachment"));
    expect(opening).toContain("userMessage: input.message");
    expect(opening).toContain("facts: []");
    expect(opening).toContain("Sabit bir cümle listesinden seçme");
    expect(opening).toContain("Şirket gerçeği, çıkarım, hüküm, işlem sonucu veya başarı iddiası üretme");
    expect(opening).toContain("İsim mesajda açıkça yoksa geçmişten veya ekrandan tahmin etme");
  });
  it("never joins opening to Agent or done/close; prevents a late opening from interleaving", () => {
    expect(route).not.toContain("await openingPromise");
    expect(route.indexOf("openingAbort.abort();")).toBeLessThan(route.indexOf("await runExecutiveAgent("));
    expect(route).toContain("if (openingAbort.signal.aborted || deliveryAbort.signal.aborted) return;");
    expect(route.indexOf("await deliverOpeningSentences({")).toBeLessThan(route.indexOf("await openingHandle.getFinalMeta();"));
    expect(route).toContain("contextualEntry, signal: deliveryAbort.signal");
  });
  it("keeps done then close then persistence, one stream and response owner", () => {
    expect(route.match(/new ReadableStream</g)).toHaveLength(1);
    expect(route.match(/new Response\(readableStream/g)).toHaveLength(1);
    const done = route.indexOf('type: "done",');
    const close = route.indexOf("controller.close();", done);
    const persist = route.indexOf("await sendAiMessage({", done);
    expect(done).toBeLessThan(close);
    expect(close).toBeLessThan(persist);
    expect(route.slice(done, close)).not.toContain("await ");
  });
  it("propagates cancellation to opening and Agent without enqueuing to a cancelled stream", () => {
    expect(route).toContain("cancel() { streamCancelled = true; abortDelivery(); }");
    expect(route).toContain("if (!streamCancelled) rawController.enqueue(bytes)");
    expect(route).toContain("AbortSignal.any([openingAbort.signal, deliveryAbort.signal])");
    expect(runtime).toContain("AbortSignal.any([controller.signal, input.signal])");
    expect(runtime).toContain("maxFunctionToolConcurrency: 1");
  });
});
