import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "crypto";

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const STATE_TTL_MS = 10 * 60 * 1000;

type OAuthState = { userId: string; organizationId: string; exp: number; nonce: string };

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

export function createOAuthState(userId: string, organizationId: string): string {
  const payload = base64url(JSON.stringify({
    userId,
    organizationId,
    exp: Date.now() + STATE_TTL_MS,
    nonce: randomBytes(16).toString("hex"),
  } satisfies OAuthState));
  const signature = createHmac("sha256", requiredEnv("GOOGLE_CLIENT_SECRET")).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyOAuthState(state: string, userId: string, organizationId: string): boolean {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return false;
  const expected = createHmac("sha256", requiredEnv("GOOGLE_CLIENT_SECRET")).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    return decoded.userId === userId && decoded.organizationId === organizationId && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

export function readOAuthStateContext(state: string): { userId: string; organizationId: string } | null {
  const payload = state.split(".")[0];
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    return typeof decoded.userId === "string" && typeof decoded.organizationId === "string"
      ? { userId: decoded.userId, organizationId: decoded.organizationId }
      : null;
  } catch {
    return null;
  }
}

export function buildGoogleAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requiredEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: requiredEnv("GOOGLE_OAUTH_REDIRECT_URI"),
    response_type: "code",
    scope: GMAIL_READONLY_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function encryptToken(token: string): string {
  const key = Buffer.from(requiredEnv("GMAIL_TOKEN_ENCRYPTION_KEY"), "hex");
  if (key.length !== 32) throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY must be 32 bytes hex encoded.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptToken(value: string): string {
  const key = Buffer.from(requiredEnv("GMAIL_TOKEN_ENCRYPTION_KEY"), "hex");
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (key.length !== 32 || !iv || !tag || !encrypted) throw new Error("Stored Gmail token is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export const googleOAuthConfig = () => ({
  clientId: requiredEnv("GOOGLE_CLIENT_ID"),
  clientSecret: requiredEnv("GOOGLE_CLIENT_SECRET"),
  redirectUri: requiredEnv("GOOGLE_OAUTH_REDIRECT_URI"),
});
