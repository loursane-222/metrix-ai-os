export const VOICE_PREFERENCES = [
  "executive_male",
  "executive_female",
] as const;

export type VoicePreference = (typeof VOICE_PREFERENCES)[number];

export const REALTIME_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const;

export type RealtimeVoice = (typeof REALTIME_VOICES)[number];

// Verified against node_modules/openai/resources/audio/speech.d.ts. The SDK's
// prose documents onyx among the built-in voices even though its permissive
// string type does not enumerate every documented built-in literal.
export const TTS_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const;

export type TtsVoice = (typeof TTS_VOICES)[number];

export type VoiceProfile = Readonly<{
  preference: VoicePreference;
  label: string;
  realtimeVoice: RealtimeVoice;
  ttsVoice: TtsVoice;
  ttsDeliveryInstructions: string;
}>;

export type VoiceSurface = "chat" | "onboarding";

export type ResolvedVoicePreference = Readonly<{
  profile: VoiceProfile;
  realtimeVoice: RealtimeVoice;
}>;

export const DEFAULT_VOICE_PREFERENCE: VoicePreference = "executive_male";

const MALE_DELIVERY_INSTRUCTIONS =
  "Türkçe konuş. Yaklaşık 60 yaşında deneyimli bir erkek genel müdürsün — tok, güven veren, karizmatik ve sakin; belgesel anlatıcısı ağırlığında konuş. Genç, parlak, coşkulu veya sempatik bir tona çıkma. Alçak registerde kal.";

const FEMALE_DELIVERY_INSTRUCTIONS =
  "Türkçe konuş. Olgun ve deneyimli bir kadın genel müdürsün — sakin, otoriter ve güven veren bir ağırlıkla konuş. Genç, parlak, coşkulu veya sempatik bir tona çıkma; kontrollü ve ölçülü kal.";

// marin and coral are both explicitly supported by the installed SDK. This
// pairing gives the female identity a composed Realtime voice and a distinct
// TTS voice whose maturity and authority are reinforced by delivery guidance.
const VOICE_PROFILES: Readonly<Record<VoicePreference, VoiceProfile>> = Object.freeze({
  executive_male: Object.freeze({
    preference: "executive_male",
    label: "Executive Male Voice",
    realtimeVoice: "cedar",
    ttsVoice: "onyx",
    ttsDeliveryInstructions: MALE_DELIVERY_INSTRUCTIONS,
  }),
  executive_female: Object.freeze({
    preference: "executive_female",
    label: "Executive Female Voice",
    realtimeVoice: "marin",
    ttsVoice: "coral",
    ttsDeliveryInstructions: FEMALE_DELIVERY_INSTRUCTIONS,
  }),
});

const REALTIME_VOICE_ALLOWLIST: ReadonlySet<string> = new Set(REALTIME_VOICES);

export function resolveVoicePreference(rawValue: string | undefined | null): VoicePreference {
  const normalized = rawValue?.trim().toLowerCase();
  return normalized === "executive_male" || normalized === "executive_female"
    ? normalized
    : DEFAULT_VOICE_PREFERENCE;
}

export function getVoiceProfile(preference: VoicePreference): VoiceProfile {
  return VOICE_PROFILES[preference];
}

export function resolveRealtimeVoice(rawValue: string | undefined | null): RealtimeVoice {
  const normalized = rawValue?.trim().toLowerCase();
  return normalized && REALTIME_VOICE_ALLOWLIST.has(normalized)
    ? (normalized as RealtimeVoice)
    : VOICE_PROFILES[DEFAULT_VOICE_PREFERENCE].realtimeVoice;
}

export function resolveVoiceAuthority(input: {
  canonicalPreference: string | undefined;
  legacyRealtimeVoice?: string | undefined;
}): ResolvedVoicePreference {
  const preference = resolveVoicePreference(input.canonicalPreference);
  const profile = getVoiceProfile(preference);

  // Only an actually unset canonical env permits the provider-level legacy
  // override. Empty or invalid canonical values deterministically choose male.
  const realtimeVoice = input.canonicalPreference === undefined
    ? resolveRealtimeVoice(input.legacyRealtimeVoice)
    : profile.realtimeVoice;

  return Object.freeze({ profile, realtimeVoice });
}

export function resolveVoiceAuthorityFromEnv(surface: VoiceSurface): ResolvedVoicePreference {
  return resolveVoiceAuthority({
    canonicalPreference: process.env.METRIX_VOICE_PREFERENCE,
    legacyRealtimeVoice: surface === "chat"
      ? process.env.CHAT_VOICE_REALTIME_VOICE
      : process.env.ONBOARDING_VOICE_REALTIME_VOICE,
  });
}
