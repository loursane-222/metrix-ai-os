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
const brandFilm = readFileSync(join(root, "src/components/brand-film/BrandFilmPlayer.tsx"), "utf8");
const brandFilmRoute = readFileSync(join(root, "src/app/api/brand-film/route.ts"), "utf8");

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
    expect(auth).toContain("disabled={busy || !consent}");
    expect(auth).toContain('href="/kvkk"');
    expect(auth).toContain('href="/gizlilik"');
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

  it("offers an optional, user-started brand film before normal chat", () => {
    expect(entry).toContain('brandFilm === "offer"');
    expect(brandFilm).toContain("Filmi Başlat");
    expect(brandFilm).toContain("Şimdi Başla");
    expect(brandFilm).toContain('preload="metadata"');
    expect(brandFilm).toContain("prefers-reduced-motion");
    expect(brandFilmRoute).toContain("BrandFilmResolved");
    expect(brandFilmRoute).toContain("organizationId: auth.organization.id");
  });

  it("keeps permissions contextual and exposes secure settings logout", () => {
    expect(chat).toContain("Metrix’le sesli konuşabilmek için mikrofon erişimine izin vermeniz gerekiyor.");
    expect(chat).toContain('aria-haspopup="menu"');
    expect(chat).toContain('fetch("/api/auth/logout"');
    expect(chat).toContain("window.location.replace");
    expect(chat).not.toContain('{ label: "Belge Tara"');
  });
});
