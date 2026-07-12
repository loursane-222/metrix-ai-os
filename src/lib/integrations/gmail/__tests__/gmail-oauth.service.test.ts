import { beforeEach, describe, expect, it } from "vitest";
import { buildGoogleAuthorizationUrl, createOAuthState, GMAIL_READONLY_SCOPE, verifyOAuthState } from "../gmail-oauth.service";

describe("Gmail OAuth read-only contract", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "state-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://metrix.test/api/integrations/gmail/callback";
  });

  it("requests only gmail.readonly", () => {
    const url = new URL(buildGoogleAuthorizationUrl(createOAuthState("user-1", "org-1")));
    expect(url.searchParams.get("scope")).toBe(GMAIL_READONLY_SCOPE);
    expect(url.searchParams.get("scope")).not.toMatch(/gmail\.(modify|compose|send)/);
  });

  it("binds short-lived state to user and organization", () => {
    const state = createOAuthState("user-1", "org-1");
    expect(verifyOAuthState(state, "user-1", "org-1")).toBe(true);
    expect(verifyOAuthState(state, "user-2", "org-1")).toBe(false);
    expect(verifyOAuthState(state, "user-1", "org-2")).toBe(false);
    expect(verifyOAuthState(`${state}broken`, "user-1", "org-1")).toBe(false);
  });
});
