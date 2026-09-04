import { beforeEach, describe, expect, it } from "vitest";
import { buildGoogleAuthorizationUrl, createOAuthState, GMAIL_READONLY_SCOPE, GOOGLE_CALENDAR_READONLY_SCOPE, GOOGLE_OAUTH_SCOPES, verifyOAuthState } from "../gmail-oauth.service";

describe("Gmail OAuth read-only contract", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "state-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://metrix.test/api/integrations/gmail/callback";
  });

  it("requests Gmail readonly and Calendar readonly in the same authorization request — one grant, no separate flow", () => {
    const url = new URL(buildGoogleAuthorizationUrl(createOAuthState("user-1", "org-1")));
    const requestedScopes = (url.searchParams.get("scope") ?? "").split(" ");
    expect(requestedScopes.sort()).toEqual([GMAIL_READONLY_SCOPE, GOOGLE_CALENDAR_READONLY_SCOPE].sort());
    expect(url.searchParams.get("scope")).not.toMatch(/gmail\.(modify|compose|send)/);
    expect(url.searchParams.get("scope")).not.toMatch(/calendar(?!\.readonly)/);
  });

  it("never requests the same scope twice — deterministic, deduplicated scope list", () => {
    expect(GOOGLE_OAUTH_SCOPES.length).toBe(new Set(GOOGLE_OAUTH_SCOPES).size);
  });

  it("binds short-lived state to user and organization", () => {
    const state = createOAuthState("user-1", "org-1");
    expect(verifyOAuthState(state, "user-1", "org-1")).toBe(true);
    expect(verifyOAuthState(state, "user-2", "org-1")).toBe(false);
    expect(verifyOAuthState(state, "user-1", "org-2")).toBe(false);
    expect(verifyOAuthState(`${state}broken`, "user-1", "org-1")).toBe(false);
  });
});
