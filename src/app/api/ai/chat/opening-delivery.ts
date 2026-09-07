const sentences = new Intl.Segmenter("tr", { granularity: "sentence" });
const terminal = /[.!?…][”’"')\]]*$/u;

// Sentence segmentation preserves decimals and URLs. Be conservative around
// short abbreviations/initials: keep them with the following sentence instead
// of exposing a fragment such as "Dr.". No word-count/prefix fallback.
function ambiguousPeriod(text: string): boolean {
  const word = text.trim().split(/\s+/u).at(-1) ?? "";
  if (!word.endsWith(".")) return false;
  const stem = word.slice(0, -1);
  return stem.length <= 4 || /[.\d/:]/u.test(stem);
}

export async function deliverOpeningSentences(input: {
  textStream: AsyncIterable<string>;
  signal: AbortSignal;
  publish: (sentence: string) => void;
  onFirstOutput: () => void;
}): Promise<void> {
  let buffer = "";
  let receivedOutput = false;
  for await (const chunk of input.textStream) {
    if (input.signal.aborted) return;
    if (!chunk) continue;
    if (!receivedOutput) {
      receivedOutput = true;
      input.onFirstOutput();
    }
    buffer += chunk;
    let consumed = 0;
    for (const part of sentences.segment(buffer)) {
      const end = part.index + part.segment.length;
      const candidate = buffer.slice(consumed, end).trim();
      // Require lookahead/whitespace while streaming: a trailing dot could
      // still become a decimal, URL or abbreviation in the next delta.
      if (!/\s$/u.test(part.segment) || !terminal.test(candidate)
        || ambiguousPeriod(candidate)) continue;
      if (input.signal.aborted) return;
      input.publish(candidate);
      consumed = end;
    }
    buffer = buffer.slice(consumed);
  }
  // EOF resolves the last sentence without waiting for usage/final metadata.
  // A truncated, unfinished sentence is never published.
  const remainder = buffer.trim();
  if (!input.signal.aborted && terminal.test(remainder)) input.publish(remainder);
}
