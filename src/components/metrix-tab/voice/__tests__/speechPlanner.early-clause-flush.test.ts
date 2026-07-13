import { describe, it, expect } from "vitest";
import { extractEarlyClauseSegment, extractSentences } from "../speechPlanner";

// Freeze Day Task 1 — First Voice Latency. extractEarlyClauseSegment is an
// additive fallback used only for a turn's still-streaming first sentence
// (see useVoiceExperienceOrchestrator.ts's onChunk); extractSentences'
// existing full-stop-only behavior is exercised alongside it here to confirm
// neither regresses the other.

describe("extractEarlyClauseSegment", () => {
  it("1: short natural answer stays a single unit — no early split", () => {
    const text = "Evet, bunu yapabiliriz.";
    // Buffer never reaches MIN_EARLY_CLAUSE_LENGTH before the sentence ends,
    // so the early path must never fire; extractSentences alone delivers it.
    expect(extractEarlyClauseSegment(text)).toBeNull();
    const { sentences, remainder } = extractSentences(text + " ");
    expect(sentences).toEqual(["Evet, bunu yapabiliriz."]);
    expect(remainder).toBe("");
  });

  it("2: long first sentence flushes at a clause boundary before the final period arrives", () => {
    const stillStreaming =
      "Burada iki ayrı sorun görüyorum, ilki tahsilat süresinin uzaması, ";
    const result = extractEarlyClauseSegment(stillStreaming);
    expect(result).not.toBeNull();
    expect(result?.segment.endsWith(",")).toBe(true);
    expect(result?.segment.length).toBeGreaterThanOrEqual(40);
    // Must not have waited for the sentence's eventual final clause/period —
    // the still-unseen remainder of the real sentence is longer than this.
    expect(result?.segment.length).toBeLessThan(stillStreaming.length);
  });

  it("3: very short intro is never flushed alone", () => {
    expect(extractEarlyClauseSegment("Peki, ")).toBeNull();
    // Confirms extractSentences agrees: a bare comma is not terminal
    // punctuation, so the buffer is left fully intact for more text to join.
    const { sentences, remainder } = extractSentences("Peki, ");
    expect(sentences).toEqual([]);
    expect(remainder).toBe("Peki, ");
  });

  it("4a: clause-boundary split never cuts a word in half", () => {
    const text =
      "Bu konuda birkaç farklı seçenek var, hepsini birlikte değerlendirelim, ";
    const result = extractEarlyClauseSegment(text);
    expect(result).not.toBeNull();
    expect(result?.segment.endsWith(",")).toBe(true);
    expect(result?.remainder.startsWith(" ")).toBe(false);
  });

  it("4b: word-boundary fallback only cuts on whitespace, never mid-word, when no punctuation exists", () => {
    const noPunctuation =
      "buyuk resimde sirketin buyume hizi son alti ayda belirgin sekilde yavasladi devam ediyor";
    const result = extractEarlyClauseSegment(noPunctuation);
    expect(result).not.toBeNull();
    expect(result!.segment.length).toBeGreaterThanOrEqual(70);
    // Segment must end exactly at a word — i.e. the character immediately
    // after it in the original text was a space, not a fragment of the next
    // word retained inside the segment.
    const boundaryChar = noPunctuation[result!.segment.length];
    expect(boundaryChar).toBe(" ");
    expect(result!.remainder.startsWith(" ")).toBe(false);
  });

  it("5: reconstructing segment + remainder never drops or duplicates streamed words", () => {
    // Same convention as extractSentences (delimiter whitespace is consumed
    // by the split, not retained by either side) — joinSentences re-inserts
    // a single space between consecutive units when rendering, so no
    // word-level content is lost. Compare modulo whitespace normalization.
    const text =
      "Burada iki ayrı sorun görüyorum, ilki tahsilat süresinin uzaması, ikincisi ise satış ekibinin takip disiplininin zayıflaması.";
    const early = extractEarlyClauseSegment(text)!;
    expect(early).not.toBeNull();
    const reconstructed = `${early.segment} ${early.remainder}`.replace(/\s+/g, " ").trim();
    expect(reconstructed).toBe(text.replace(/\s+/g, " ").trim());
  });

  it("returns null below both length thresholds even with a qualifying-looking boundary nearby", () => {
    expect(extractEarlyClauseSegment("Tamam, bakalım.")).toBeNull();
  });
});
