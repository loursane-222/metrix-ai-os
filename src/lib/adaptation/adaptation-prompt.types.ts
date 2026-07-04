import type { RecognitionMemoryKey } from "@/lib/recognition/recognition-snapshot.types";

export type AdaptationPrompt = {
  title: string;
  message: string;
  opportunityKey: RecognitionMemoryKey;
};
