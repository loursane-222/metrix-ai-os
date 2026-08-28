import { afterEach, describe, expect, it } from "vitest";

import {
  getVoiceProfile,
  resolveRealtimeVoice,
  resolveVoiceAuthority,
  resolveVoiceAuthorityForUser,
  resolveVoicePreference,
} from "../voice-preference-authority";

describe("voice preference authority", () => {
  it.each([undefined, null, "", "unknown"])("defaults %s to executive_male", (value) => {
    expect(resolveVoicePreference(value)).toBe("executive_male");
  });

  it("normalizes canonical casing and whitespace", () => {
    expect(resolveVoicePreference("  EXECUTIVE_FEMALE ")).toBe("executive_female");
  });

  it("defines the established male provider mapping", () => {
    expect(getVoiceProfile("executive_male")).toMatchObject({
      preference: "executive_male",
      realtimeVoice: "cedar",
      ttsVoice: "onyx",
    });
  });

  it("defines an SDK-supported female provider mapping", () => {
    expect(getVoiceProfile("executive_female")).toMatchObject({
      preference: "executive_female",
      realtimeVoice: "marin",
      ttsVoice: "coral",
    });
  });

  it("returns immutable profiles and resolutions", () => {
    expect(Object.isFrozen(getVoiceProfile("executive_male"))).toBe(true);
    expect(Object.isFrozen(resolveVoiceAuthority({ canonicalPreference: undefined }))).toBe(true);
  });

  it("never forwards an unknown realtime provider voice", () => {
    expect(resolveRealtimeVoice("unknown-provider-voice")).toBe("cedar");
  });

  it("gives a present canonical preference precedence over a legacy override", () => {
    expect(resolveVoiceAuthority({
      canonicalPreference: "executive_female",
      legacyRealtimeVoice: "ash",
    })).toMatchObject({
      profile: { preference: "executive_female", ttsVoice: "coral" },
      realtimeVoice: "marin",
    });
  });

  it.each(["chat", "onboarding"])("supports an unset canonical + valid %s legacy override", () => {
    const result = resolveVoiceAuthority({
      canonicalPreference: undefined,
      legacyRealtimeVoice: "ash",
    });
    expect(result.realtimeVoice).toBe("ash");
    expect(result.profile.ttsVoice).toBe("onyx");
  });

  it("falls back safely for an invalid legacy override", () => {
    expect(resolveVoiceAuthority({
      canonicalPreference: undefined,
      legacyRealtimeVoice: "onyx",
    }).realtimeVoice).toBe("cedar");
  });

  it("treats an invalid present canonical value as male, not as permission for legacy", () => {
    expect(resolveVoiceAuthority({
      canonicalPreference: "invalid",
      legacyRealtimeVoice: "ash",
    })).toMatchObject({
      profile: { preference: "executive_male", ttsVoice: "onyx" },
      realtimeVoice: "cedar",
    });
  });

  it("gives chat and onboarding the same profile for a canonical selection", () => {
    const chat = resolveVoiceAuthority({ canonicalPreference: "executive_female" });
    const onboarding = resolveVoiceAuthority({ canonicalPreference: "executive_female" });
    expect(chat.profile).toBe(onboarding.profile);
    expect(chat.realtimeVoice).toBe(onboarding.realtimeVoice);
  });
});

describe("resolveVoiceAuthorityForUser", () => {
  const originalEnv = process.env.METRIX_VOICE_PREFERENCE;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.METRIX_VOICE_PREFERENCE;
    else process.env.METRIX_VOICE_PREFERENCE = originalEnv;
  });

  it("gives the user's stored preference precedence over the server-wide env default", () => {
    process.env.METRIX_VOICE_PREFERENCE = "executive_male";

    const result = resolveVoiceAuthorityForUser("chat", "executive_female");

    expect(result.profile.preference).toBe("executive_female");
  });

  it("falls back to the env default when the user has no stored preference", () => {
    process.env.METRIX_VOICE_PREFERENCE = "executive_female";

    expect(resolveVoiceAuthorityForUser("chat", null).profile.preference).toBe("executive_female");
    expect(resolveVoiceAuthorityForUser("chat", undefined).profile.preference).toBe("executive_female");
  });

  it("falls back to the global default when neither the user nor env set a preference", () => {
    delete process.env.METRIX_VOICE_PREFERENCE;

    expect(resolveVoiceAuthorityForUser("chat", null).profile.preference).toBe("executive_male");
  });
});
