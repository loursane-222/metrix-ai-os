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
