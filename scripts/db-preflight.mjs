#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const REQUIRED_VARIABLE = "DATABASE_URL";
const CHECKED_VARIABLES = [
  "DATABASE_URL",
  "DIRECT_URL",
  "SHADOW_DATABASE_URL",
];
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

loadDotEnvFile(".env");
loadDotEnvFile(".env.local", { override: true });
loadDotEnvFile(".env.development");

const failures = [];

for (const variableName of CHECKED_VARIABLES) {
  const value = process.env[variableName];

  if (!value) {
    if (variableName === REQUIRED_VARIABLE) {
      failures.push(`${variableName} is missing.`);
    }

    continue;
  }

  const parsed = parseDatabaseUrl(value);

  if (!parsed.ok) {
    failures.push(`${variableName} is not a valid database URL.`);
    continue;
  }

  const host = parsed.host.toLowerCase();
  const masked = `${parsed.protocol}//***:***@HOST=${host}`;

  console.log(`${variableName}: ${masked}`);

  const blockedReason = getBlockedReason(host);

  if (blockedReason) {
    failures.push(`${variableName} uses blocked host "${host}" (${blockedReason}).`);
    continue;
  }

  if (!SAFE_HOSTS.has(host)) {
    failures.push(`${variableName} uses unknown remote host "${host}".`);
  }
}

if (failures.length > 0) {
  console.error("");
  console.error("Unsafe database host for local dev. Use local Postgres or approved dev DB.");

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log("DB preflight passed");

function parseDatabaseUrl(value) {
  try {
    const url = new URL(value);

    if (!url.hostname) {
      return { ok: false };
    }

    return {
      ok: true,
      protocol: url.protocol,
      host: url.hostname,
    };
  } catch {
    return { ok: false };
  }
}

function getBlockedReason(host) {
  return BLOCKED_HOST_PARTS.find((part) => host.includes(part));
}

function loadDotEnvFile(fileName, options = {}) {
  const filePath = resolve(process.cwd(), fileName);

  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);

    if (!parsed || (!options.override && process.env[parsed.key] !== undefined)) {
      continue;
    }

    process.env[parsed.key] = parsed.value;
  }
}

function parseEnvLine(line) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const equalsIndex = trimmed.indexOf("=");

  if (equalsIndex === -1) {
    return null;
  }

  const key = trimmed.slice(0, equalsIndex).trim();
  let value = trimmed.slice(equalsIndex + 1).trim();

  if (!key) {
    return null;
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return {
    key,
    value,
  };
}
