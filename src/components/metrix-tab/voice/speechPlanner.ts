// Sentence segmentation for streaming Executive Brain output. Pure,
// synchronous text parsing only — deciding HOW a sentence is delivered
// (style, pacing) is the Conversation Rhythm Engine's job, not this file's
// (see rhythmEngine.ts).

export function endsWithTerminalPunctuation(text: string): boolean {
  return /[.!?…]["')]?$/.test(text.trimEnd());
}

// Splits accumulated streaming text at sentence boundaries for chunked TTS.
// Requires space/tab or a bare newline after terminal punctuation to avoid
// splitting decimal numbers (e.g. "3.5 milyon") or abbreviations mid-stream.
// \n alone is a valid boundary because LLM deltas frequently deliver the
// newline as a separate chunk with no trailing space.
export function extractSentences(text: string): { sentences: string[]; remainder: string } {
  const sentences: string[] = [];
  const re = /[.!?]+(?:[ \t]+|\n)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const sentence = text.slice(lastIndex, match.index + match[0].trimEnd().length).trim();
    if (sentence) sentences.push(sentence);
    lastIndex = match.index + match[0].length;
  }
  return { sentences, remainder: text.slice(lastIndex) };
}

// First-Sentence Early Flush (Freeze Day Task 1, first-voice-latency pass).
// extractSentences above only ever yields a unit at `.!?` — for a long first
// sentence (the one gating time-to-first-audio) that means TTS waits for the
// ENTIRE sentence even when a natural clause boundary passed by many
// characters earlier. This is a narrow, additive fallback for that one case:
// called ONLY while the caller (useVoiceExperienceOrchestrator's onChunk) is
// still waiting on the turn's first sentence AND extractSentences found
// nothing yet. It never runs once any sentence has already been enqueued —
// every later sentence keeps today's full-stop-only segmentation untouched.
//
// Length gates exist specifically so short interjections ("Peki,", "Evet,")
// are never flushed alone (see MIN_EARLY_CLAUSE_LENGTH) and so a boundary is
// only ever cut on whitespace (see the word-boundary fallback), never
// mid-word.
const MIN_EARLY_CLAUSE_LENGTH = 40;
const MIN_EARLY_WORD_BOUNDARY_LENGTH = 70;
const CLAUSE_BOUNDARY_RE = /[,;:]+[ \t]+/g;

export function extractEarlyClauseSegment(
  text: string,
): { segment: string; remainder: string } | null {
  if (text.length >= MIN_EARLY_CLAUSE_LENGTH) {
    CLAUSE_BOUNDARY_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CLAUSE_BOUNDARY_RE.exec(text)) !== null) {
      const end = match.index + match[0].length;
      if (end >= MIN_EARLY_CLAUSE_LENGTH) {
        const segment = text.slice(0, end).trim();
        if (!segment) return null;
        return { segment, remainder: text.slice(end) };
      }
    }
  }

  // No comma/semicolon/colon boundary at all yet, but the buffer has grown
  // long enough that waiting further would visibly delay first audio.
  // Falls back to the nearest space at/after the safe threshold so a word is
  // never cut in half.
  if (text.length >= MIN_EARLY_WORD_BOUNDARY_LENGTH) {
    const spaceIndex = text.indexOf(" ", MIN_EARLY_WORD_BOUNDARY_LENGTH);
    if (spaceIndex > 0) {
      const segment = text.slice(0, spaceIndex).trim();
      if (!segment) return null;
      return { segment, remainder: text.slice(spaceIndex + 1) };
    }
  }

  return null;
}
