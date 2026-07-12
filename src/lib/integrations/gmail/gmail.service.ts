import { prisma } from "@/lib/core/shared/prisma";
import { decryptToken, encryptToken, GMAIL_READONLY_SCOPE, googleOAuthConfig } from "./gmail-oauth.service";
import type { GmailConnectionStatus, GmailMessageSource, GmailRetrievalContext } from "./gmail.types";

const MAX_MESSAGES = 5;
const MAX_BODY_CHARS = 2500;

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };
type GmailProfile = { emailAddress: string };
type GmailList = { messages?: Array<{ id: string; threadId: string }> };
type GmailPayload = { mimeType?: string; body?: { data?: string }; parts?: GmailPayload[]; headers?: Array<{ name: string; value: string }> };
type GmailMessage = { id: string; threadId: string; internalDate?: string; snippet?: string; payload?: GmailPayload };

async function googleJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const json = await response.json() as T & { error?: { message?: string } | string };
  if (!response.ok) throw new Error(`GOOGLE_${response.status}`);
  return json;
}

export async function exchangeOAuthCode(code: string): Promise<TokenResponse> {
  const config = googleOAuthConfig();
  return googleJson<TokenResponse>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code" }),
  });
}

export async function connectGmail(input: { organizationId: string; userId: string; tokens: TokenResponse }): Promise<void> {
  if (!input.tokens.access_token) throw new Error("GOOGLE_TOKEN_MISSING");
  const identity = await googleJson<GmailProfile>("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${input.tokens.access_token}` },
  });
  const providerAccountId = identity.emailAddress.trim().toLowerCase();
  const existing = await prisma.gmailConnection.findUnique({
    where: { organizationId_userId_providerAccountId: { organizationId: input.organizationId, userId: input.userId, providerAccountId } },
  });
  await prisma.gmailConnection.upsert({
    where: { organizationId_userId_providerAccountId: { organizationId: input.organizationId, userId: input.userId, providerAccountId } },
    create: {
      organizationId: input.organizationId, userId: input.userId, providerAccountId,
      providerEmail: identity.emailAddress, accessTokenEncrypted: encryptToken(input.tokens.access_token),
      refreshTokenEncrypted: input.tokens.refresh_token ? encryptToken(input.tokens.refresh_token) : null,
      tokenExpiresAt: input.tokens.expires_in ? new Date(Date.now() + input.tokens.expires_in * 1000) : null,
      grantedScopes: input.tokens.scope ?? GMAIL_READONLY_SCOPE,
    },
    update: {
      providerEmail: identity.emailAddress, accessTokenEncrypted: encryptToken(input.tokens.access_token),
      ...(input.tokens.refresh_token ? { refreshTokenEncrypted: encryptToken(input.tokens.refresh_token) } : {}),
      tokenExpiresAt: input.tokens.expires_in ? new Date(Date.now() + input.tokens.expires_in * 1000) : null,
      grantedScopes: input.tokens.scope ?? existing?.grantedScopes ?? GMAIL_READONLY_SCOPE,
      status: "CONNECTED", connectedAt: new Date(), lastErrorAt: null, lastErrorCode: null,
    },
  });
}

export async function getGmailStatus(organizationId: string, userId: string): Promise<GmailConnectionStatus> {
  const row = await prisma.gmailConnection.findFirst({ where: { organizationId, userId }, orderBy: { updatedAt: "desc" } });
  if (!row) return { connected: false, providerEmail: null, readOnly: true, status: "NOT_CONNECTED", connectedAt: null, lastSuccessfulAccessAt: null, lastErrorCode: null };
  return { connected: row.status === "CONNECTED", providerEmail: row.providerEmail, readOnly: true, status: row.status === "CONNECTED" ? "CONNECTED" : "RECONNECT_REQUIRED", connectedAt: row.connectedAt.toISOString(), lastSuccessfulAccessAt: row.lastSuccessfulAccessAt?.toISOString() ?? null, lastErrorCode: row.lastErrorCode };
}

export async function disconnectGmail(organizationId: string, userId: string): Promise<void> {
  const connection = await prisma.gmailConnection.findFirst({ where: { organizationId, userId }, orderBy: { updatedAt: "desc" } });
  if (!connection) return;
  try {
    const token = connection.refreshTokenEncrypted
      ? decryptToken(connection.refreshTokenEncrypted)
      : decryptToken(connection.accessTokenEncrypted);
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
  } finally {
    await prisma.gmailConnection.delete({ where: { id: connection.id } });
  }
}

export function isExplicitGmailRequest(message: string): boolean {
  const lower = message.toLocaleLowerCase("tr-TR");
  const mailTerm = /(e-?posta|email|e-mail|mail|gmail|gelen kutu|yazışma)/i.test(lower);
  const action = /(bul|ara|bak|kontrol|göster|oku|geldi|var mı|son|önemli)/i.test(lower);
  return mailTerm && action;
}

function gmailQuery(message: string): string {
  return message.replace(/\b(e-?posta(?:ları|yı|lar)?|email|e-mail|mail|gmail|gelen kutu(?:su|m)?|bul|ara|bak|kontrol et|göster|oku|var mı|son|önemli)\b/gi, " ").replace(/\s+/g, " ").trim().slice(0, 180) || "newer_than:7d";
}

async function validAccessToken(connection: { id: string; accessTokenEncrypted: string; refreshTokenEncrypted: string | null; tokenExpiresAt: Date | null }): Promise<string> {
  if (!connection.tokenExpiresAt || connection.tokenExpiresAt.getTime() > Date.now() + 60_000) return decryptToken(connection.accessTokenEncrypted);
  if (!connection.refreshTokenEncrypted) throw new Error("REFRESH_TOKEN_MISSING");
  const config = googleOAuthConfig();
  const tokens = await googleJson<TokenResponse>("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: decryptToken(connection.refreshTokenEncrypted), grant_type: "refresh_token" }),
  });
  await prisma.gmailConnection.update({ where: { id: connection.id }, data: { accessTokenEncrypted: encryptToken(tokens.access_token), tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null, status: "CONNECTED", lastErrorAt: null, lastErrorCode: null } });
  return tokens.access_token;
}

function header(payload: GmailPayload | undefined, name: string): string {
  return payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function plainBody(payload: GmailPayload | undefined): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return Buffer.from(payload.body.data, "base64url").toString("utf8");
  if (payload.mimeType === "text/html" && payload.body?.data) return Buffer.from(payload.body.data, "base64url").toString("utf8").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
  return (payload.parts ?? []).map(plainBody).find(Boolean) ?? "";
}

export async function retrieveGmailContext(input: { organizationId: string; userId: string; message: string }): Promise<GmailRetrievalContext> {
  const retrievedAt = new Date().toISOString();
  if (!isExplicitGmailRequest(input.message)) return { requested: false, status: "OK", retrievedAt, messages: [] };
  const connection = await prisma.gmailConnection.findFirst({ where: { organizationId: input.organizationId, userId: input.userId }, orderBy: { updatedAt: "desc" } });
  if (!connection) return { requested: true, status: "NOT_CONNECTED", retrievedAt, messages: [] };
  try {
    const token = await validAccessToken(connection);
    const list = await googleJson<GmailList>(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${MAX_MESSAGES}&q=${encodeURIComponent(gmailQuery(input.message))}`, { headers: { Authorization: `Bearer ${token}` } });
    const details = await Promise.all((list.messages ?? []).slice(0, MAX_MESSAGES).map((item) => googleJson<GmailMessage>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`, { headers: { Authorization: `Bearer ${token}` } })));
    const messages: GmailMessageSource[] = details.map((item) => ({ provider: "gmail", messageId: item.id, threadId: item.threadId, gmailUrl: `https://mail.google.com/mail/u/0/#all/${item.threadId}`, sender: header(item.payload, "From"), recipients: header(item.payload, "To"), subject: header(item.payload, "Subject") || "(Konu yok)", receivedAt: item.internalDate ? new Date(Number(item.internalDate)).toISOString() : header(item.payload, "Date"), snippet: (item.snippet ?? "").slice(0, 500), body: plainBody(item.payload).replace(/\s+/g, " ").trim().slice(0, MAX_BODY_CHARS) }));
    await prisma.gmailConnection.update({ where: { id: connection.id }, data: { lastSuccessfulAccessAt: new Date(), status: "CONNECTED", lastErrorAt: null, lastErrorCode: null } });
    return { requested: true, status: messages.length ? "OK" : "NO_RESULTS", retrievedAt, messages };
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 80) : "GMAIL_UNAVAILABLE";
    await prisma.gmailConnection.update({ where: { id: connection.id }, data: { status: "RECONNECT_REQUIRED", lastErrorAt: new Date(), lastErrorCode: code } });
    return { requested: true, status: code.includes("REFRESH") || code.includes("GOOGLE_401") ? "RECONNECT_REQUIRED" : "UNAVAILABLE", retrievedAt, messages: [] };
  }
}
