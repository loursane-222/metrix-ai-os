import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  gmailConnection: {
    findFirst: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), delete: vi.fn(),
  },
}));

vi.mock("@/lib/core/shared/prisma", () => ({ prisma: prismaMock }));
vi.mock("../gmail-oauth.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../gmail-oauth.service")>();
  return { ...actual, encryptToken: (value: string) => `enc:${value}`, decryptToken: (value: string) => value.replace("enc:", ""), googleOAuthConfig: () => ({ clientId: "id", clientSecret: "secret", redirectUri: "uri" }) };
});

import { connectGmail, disconnectGmail, isExplicitGmailRequest, retrieveGmailContext } from "../gmail.service";

const connection = {
  id: "connection-1", organizationId: "org-1", userId: "user-1", providerAccountId: "google-1",
  accessTokenEncrypted: "enc:owner-token", refreshTokenEncrypted: "enc:refresh", tokenExpiresAt: new Date(Date.now() + 3_600_000),
};

describe("Gmail read-only retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("does not retrieve Gmail during normal conversation", async () => {
    const result = await retrieveGmailContext({ organizationId: "org-1", userId: "user-1", message: "Satış hedefimiz nasıl gidiyor?" });
    expect(result.requested).toBe(false);
    expect(prismaMock.gmailConnection.findFirst).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("recognizes explicit email search requests", () => {
    expect(isExplicitGmailRequest("Ahmet'ten gelen son e-postayı bul")).toBe(true);
    expect(isExplicitGmailRequest("Duru Mermer ile ilgili son yazışmayı göster")).toBe(true);
  });

  it("returns an explicit no-connection context without fabricating messages", async () => {
    prismaMock.gmailConnection.findFirst.mockResolvedValue(null);
    const result = await retrieveGmailContext({ organizationId: "org-1", userId: "user-1", message: "Son e-postayı bul" });
    expect(result).toMatchObject({ requested: true, status: "NOT_CONNECTED", messages: [] });
  });

  it("queries only the authenticated owner's connection and preserves bounded source identity", async () => {
    prismaMock.gmailConnection.findFirst.mockResolvedValue(connection);
    prismaMock.gmailConnection.update.mockResolvedValue(connection);
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: Array.from({ length: 8 }, (_, index) => ({ id: `m${index}`, threadId: `t${index}` })) }), { status: 200 }))
      .mockImplementation(async (url) => new Response(JSON.stringify({ id: String(url).match(/messages\/(m\d+)/)?.[1], threadId: "thread-source", internalDate: "1710000000000", snippet: "snippet", payload: { headers: [{ name: "From", value: "Ahmet <a@test.com>" }, { name: "To", value: "me@test.com" }, { name: "Subject", value: "Tahsilat" }], mimeType: "text/plain", body: { data: Buffer.from("x".repeat(4000)).toString("base64url") } } }), { status: 200 }));
    const result = await retrieveGmailContext({ organizationId: "org-1", userId: "user-1", message: "Tahsilat e-postalarını kontrol et" });
    expect(prismaMock.gmailConnection.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1", userId: "user-1" } }));
    expect(result.messages).toHaveLength(5);
    expect(result.messages[0]).toMatchObject({ provider: "gmail", messageId: "m0", threadId: "thread-source", sender: "Ahmet <a@test.com>" });
    expect(result.messages[0].body.length).toBeLessThanOrEqual(2500);
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ headers: { Authorization: "Bearer owner-token" } });
  });

  it("marks connection unhealthy when token refresh fails", async () => {
    prismaMock.gmailConnection.findFirst.mockResolvedValue({ ...connection, tokenExpiresAt: new Date(0) });
    prismaMock.gmailConnection.update.mockResolvedValue(connection);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 401 }));
    const result = await retrieveGmailContext({ organizationId: "org-1", userId: "user-1", message: "Gmail'deki son maili bul" });
    expect(result.status).toBe("RECONNECT_REQUIRED");
    expect(result.messages).toEqual([]);
    expect(prismaMock.gmailConnection.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "RECONNECT_REQUIRED" }) }));
  });

  it("does not erase an existing refresh token when callback omits it", async () => {
    prismaMock.gmailConnection.findUnique.mockResolvedValue({ ...connection, grantedScopes: "readonly" });
    prismaMock.gmailConnection.upsert.mockResolvedValue(connection);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ emailAddress: "owner@gmail.com" }), { status: 200 }));
    await connectGmail({ organizationId: "org-1", userId: "user-1", tokens: { access_token: "new-access", expires_in: 3600 } });
    const update = prismaMock.gmailConnection.upsert.mock.calls[0][0].update;
    expect(update).not.toHaveProperty("refreshTokenEncrypted");
  });

  it("disconnects only the authenticated user's organization connection", async () => {
    prismaMock.gmailConnection.findFirst.mockResolvedValue(connection);
    prismaMock.gmailConnection.delete.mockResolvedValue(connection);
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 200 }));
    await disconnectGmail("org-1", "user-1");
    expect(prismaMock.gmailConnection.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1", userId: "user-1" } }));
    expect(prismaMock.gmailConnection.delete).toHaveBeenCalledWith({ where: { id: "connection-1" } });
  });
});
