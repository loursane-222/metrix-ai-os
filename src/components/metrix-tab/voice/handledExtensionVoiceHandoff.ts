export function handoffHandledExtensionVoice(input: {
  source: "voice" | "written";
  message: string | null;
  duplicate: boolean;
  nativeRealtime: boolean;
  suppressNativeAssistant: () => void;
  speakDeterministicResponse: (text: string) => void;
}): boolean {
  if (input.duplicate || input.source !== "voice") return false;
  if (input.nativeRealtime) input.suppressNativeAssistant();
  const text = input.message?.trim();
  if (!text) return false;
  input.speakDeterministicResponse(text);
  return true;
}
