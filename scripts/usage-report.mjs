#!/usr/bin/env node

/**
 * Per-organization AI usage report — for calibrating subscription tier limits.
 * Reads real token usage already recorded on AI messages (Message.metadata.usage,
 * written by src/app/api/ai/chat/route.ts) and real voice-call duration/token
 * usage reported by the client at call end (Event.eventType = VOICE_SESSION_ENDED,
 * src/app/api/ai/chat/voice/session/end/route.ts) — the client is the only place
 * that ever sees a realtime call's usage, since it talks to OpenAI's Realtime API
 * directly over WebRTC after the server hands out an ephemeral client secret.
 *
 * Voice reporting is best-effort (sendBeacon/keepalive-fetch from the browser at
 * call end — see reportVoiceSessionEnd in useVoiceChatConnection.ts): a hard
 * crash or lost connectivity can drop a report, so treat voice totals as a
 * reliable floor, not an exact figure.
 *
 * Defaults to local-only (same safe-host guard as seed-demo.mjs). To size
 * tiers off real customer usage, run it yourself with your own production
 * DATABASE_URL and --allow-remote — this script only ever SELECTs, it never
 * writes. An AI agent running this script must never pass --allow-remote
 * itself; that flag is for a human operator to use deliberately.
 *
 * Usage:
 *   node scripts/usage-report.mjs
 *   node scripts/usage-report.mjs --json
 *   DATABASE_URL=<production-url> node scripts/usage-report.mjs --allow-remote
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

loadDotEnvFile(".env");
loadDotEnvFile(".env.local", { override: true });
loadDotEnvFile(".env.development");

const SAFE_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "postgres",
  "db",
  "host.docker.internal",
]);

const BLOCKED_HOST_PARTS = [
  "supabase.com",
  "pooler.supabase.com",
  "production",
  "prod",
  "vercel",
];

const args = new Set(process.argv.slice(2));
const asJson = args.has("--json");
const allowRemote = args.has("--allow-remote");

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("Error: DATABASE_URL is not set.");
  process.exit(1);
}

const parsedUrl = parseDbUrl(dbUrl);
if (!parsedUrl.ok) {
  console.error("Error: DATABASE_URL is not a valid URL.");
  process.exit(1);
}

const host = parsedUrl.host.toLowerCase();

// This script only ever SELECTs (no writes), so — unlike seed-demo.mjs, which
// this guard pattern is copied from — a human operator who deliberately wants
// real numbers to size subscription tiers can opt into pointing it at a
// remote/production DATABASE_URL with --allow-remote. Without the flag the
// default stays exactly as strict as before (local-only), including for any
// automated/AI-driven run of this script, which must never pass it itself.
if (!allowRemote) {
  const blockedReason = BLOCKED_HOST_PARTS.find((part) => host.includes(part));
  if (blockedReason) {
    console.error(`Error: DATABASE_URL uses blocked host "${host}" (matches "${blockedReason}").`);
    console.error("This script only runs against local databases by default. Pass --allow-remote to opt in.");
    process.exit(1);
  }

  if (!SAFE_HOSTS.has(host)) {
    console.error(`Error: DATABASE_URL host "${host}" is not in the safe hosts list.`);
    console.error(`Safe hosts: ${[...SAFE_HOSTS].join(", ")}`);
    console.error("Pass --allow-remote to opt into a remote/production host.");
    process.exit(1);
  }
} else {
  console.warn(`WARNING: --allow-remote set — connecting to "${host}" (read-only SELECT queries only).\n`);
}

const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("@prisma/client");

const adapter = new PrismaPg({ connectionString: dbUrl });
const prisma = new PrismaClient({ adapter });

try {
  const tokenRows = await prisma.$queryRaw`
    SELECT
      c."organizationId" AS "organizationId",
      date_trunc('month', m."createdAt") AS month,
      count(*) AS ai_message_count,
      sum((m.metadata->'usage'->>'inputTokens')::bigint) AS input_tokens,
      sum((m.metadata->'usage'->>'outputTokens')::bigint) AS output_tokens,
      sum((m.metadata->'usage'->>'totalTokens')::bigint) AS total_tokens
    FROM "Message" m
    JOIN "Conversation" c ON c.id = m."conversationId"
    WHERE m."senderType" = 'AI' AND m.metadata->'usage' IS NOT NULL
    GROUP BY c."organizationId", date_trunc('month', m."createdAt")
    ORDER BY c."organizationId", month;
  `;

  const voiceRows = await prisma.$queryRaw`
    SELECT
      "organizationId",
      date_trunc('month', "createdAt") AS month,
      count(*) AS voice_calls_reported,
      sum((payload->>'durationMs')::bigint) AS voice_duration_ms,
      sum((payload->>'inputTokens')::bigint) AS voice_input_tokens,
      sum((payload->>'outputTokens')::bigint) AS voice_output_tokens,
      sum((payload->>'totalTokens')::bigint) AS voice_total_tokens
    FROM "Event"
    WHERE "eventType" = 'VOICE_SESSION_ENDED'
    GROUP BY "organizationId", month
    ORDER BY "organizationId", month;
  `;

  const orgIds = new Set([
    ...tokenRows.map((r) => r.organizationId),
    ...voiceRows.map((r) => r.organizationId),
  ]);
  const orgs = orgIds.size
    ? await prisma.organization.findMany({
        where: { id: { in: [...orgIds] } },
        select: { id: true, name: true },
      })
    : [];
  const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));

  const tokenByKey = new Map(tokenRows.map((r) => [`${r.organizationId}|${r.month.toISOString()}`, r]));
  const voiceByKey = new Map(voiceRows.map((r) => [`${r.organizationId}|${r.month.toISOString()}`, r]));
  const allKeys = new Set([...tokenByKey.keys(), ...voiceByKey.keys()]);

  const report = [...allKeys].map((key) => {
    const [organizationId, monthIso] = key.split("|");
    const t = tokenByKey.get(key);
    const v = voiceByKey.get(key);
    return {
      organizationId,
      organizationName: orgNameById.get(organizationId) ?? "(bilinmiyor)",
      month: monthIso.slice(0, 7),
      aiMessageCount: Number(t?.ai_message_count ?? 0),
      inputTokens: Number(t?.input_tokens ?? 0),
      outputTokens: Number(t?.output_tokens ?? 0),
      totalTokens: Number(t?.total_tokens ?? 0),
      voiceCallsReported: Number(v?.voice_calls_reported ?? 0),
      voiceDurationMs: Number(v?.voice_duration_ms ?? 0),
      voiceInputTokens: Number(v?.voice_input_tokens ?? 0),
      voiceOutputTokens: Number(v?.voice_output_tokens ?? 0),
      voiceTotalTokens: Number(v?.voice_total_tokens ?? 0),
    };
  }).sort((a, b) => (a.organizationName + a.month).localeCompare(b.organizationName + b.month));

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\nAI usage by organization / month (host: ${host})\n`);
    if (report.length === 0) {
      console.log("No AI messages or voice calls with recorded usage found.");
    } else {
      console.table(
        report.map((r) => ({
          org: r.organizationName,
          month: r.month,
          "ai msgs": r.aiMessageCount,
          "text tok": r.totalTokens,
          "voice calls": r.voiceCallsReported,
          "voice min": Math.round((r.voiceDurationMs / 60000) * 10) / 10,
          "voice tok": r.voiceTotalTokens,
        })),
      );
    }
    console.log(
      "\nNOT: \"voice calls\" — istemcinin çağrı sonunda başarıyla rapor ettiği\n" +
      "sayıdır (best-effort — sendBeacon/keepalive fetch; sert bir çökme ya da\n" +
      "bağlantı kaybı bir raporu kaybettirebilir). Gerçek sayının güvenilir bir\n" +
      "alt sınırı olarak oku, tam kesin bir rakam olarak değil.\n",
    );
    if (!allowRemote) {
      console.log(
        `NOT: bu script yalnızca yerel veritabanına (${host}) bağlanıyor — üretim\n` +
        "verisine dokunmuyor. Gerçek müşteri kullanımına göre paket boyutlandırmak\n" +
        "için: DATABASE_URL=<production-url> node scripts/usage-report.mjs --allow-remote\n",
      );
    }
  }
} finally {
  await prisma.$disconnect();
}

function parseDbUrl(value) {
  try {
    const url = new URL(value);
    return { ok: true, host: url.hostname };
  } catch {
    return { ok: false };
  }
}

function loadDotEnvFile(fileName, { override = false } = {}) {
  const filePath = resolve(rootDir, fileName);
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
