export type LatencyMark = "stt_final" | "company_request_start" | "reaction_chunk_received"
  | "reaction_response_create" | "first_realtime_audio_event" | "first_audible_pcm"
  | "first_progressive_chunk_received" | "authoritative_result_received"
  | "company_request_received" | "classification_start" | "classification_complete"
  | "opening_start" | "executive_start" | "opening_sentence_delivered"
  | "first_progressive_publish" | "executive_complete" | "company_response_complete";

/** Clock domains are independent: subtract only timestamps from the same side.
 * No content, credentials, business payloads, or wall-clock estimates are recorded.
 * Missing marks mean UNKNOWN. Logging failures cannot affect execution.
 */
export function latencyMark(side: "client" | "server", turnId: string, event: LatencyMark, monotonicMs = performance.now()) {
  try {
    setTimeout(() => {
      try { console.info("[voice-latency]", { side, turnId, event, monotonicMs }); } catch { /* observational only */ }
    }, 0);
  } catch { /* observational only */ }
}
