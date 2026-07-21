import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const entry = readFileSync(join(root, "src/app/metrix-onboarding-app.tsx"), "utf8");
const auth = readFileSync(join(root, "src/components/auth/AuthExperience.tsx"), "utf8");
const organization = readFileSync(join(root, "src/components/auth/OrganizationSetup.tsx"), "utf8");
const chat = readFileSync(join(root, "src/components/metrix-tab/MetrixChatTab.tsx"), "utf8");
const firstExperienceHook = readFileSync(join(root, "src/components/metrix-tab/first-experience/useFirstExperience.ts"), "utf8");
const voice = readFileSync(join(root, "src/components/metrix-tab/useVoiceChatConnection.ts"), "utf8");

describe("production entry authority", () => {
  it("routes only session, organization and normal Metrix runtime", () => {
    expect(entry).toContain("if (!session)");
    expect(entry).toContain("if (!organization)");
    expect(entry).toContain("<MetrixTabScreen />");
    expect(entry).not.toMatch(/V1IntroFlow|LockedOnboardingFlow|FirstMeetingFlow|VoiceDiscoveryPanel/);
    expect(entry).not.toContain("onboardingCompleted");
  });

  it("keeps email, OTP, remember-me and accessible labels in one auth shell", () => {
    expect(auth).toContain("<AuthShell>");
    expect(auth).toContain('htmlFor="login-email"');
    expect(auth).toContain('htmlFor="login-otp"');
    expect(auth).toContain("rememberMe");
    expect(auth).toContain("one-time-code");
    expect(auth).toContain("resendAt");
  });

  it("asks organization name only and hands off to the runtime endpoint", () => {
    expect(organization).toContain('htmlFor="organization-name"');
    expect(organization).toContain('fetch("/api/organizations"');
    expect(organization).not.toMatch(/industry|teamSize|mainChallenge|firstGoal|Daily Brief/);
  });

  it("uses only normal chat and voice authorities", () => {
    expect(chat).toContain("useFirstExperience");
    expect(firstExperienceHook).toContain('fetch("/api/first-experience"');
    expect(chat).not.toMatch(/api\/onboarding\/discovery|VoiceDiscoveryPanel/);
    expect(voice).toContain('/api/ai/chat/voice/session');
    expect(voice).not.toMatch(/api\/onboarding\/voice\/(session|tts)/);
  });
});
