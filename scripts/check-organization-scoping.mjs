import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCHEMA_PATH = path.join(ROOT, "prisma/schema.prisma");
const SOURCE_ROOT = path.join(ROOT, "src");
const GUARDED_METHODS = new Set(["findMany", "findFirst", "findUnique", "update", "updateMany", "delete", "deleteMany", "count", "aggregate", "upsert"]);

// Models without their own organizationId whose required owner relation is org-scoped.
const RELATION_SCOPED_MODELS = new Map([
  ["Message", "conversation.organizationId"],
  ["LedgerEntryLine", "ledgerEntry.organizationId"],
]);

// Every exception is exact and reviewable; broad file/model suppressions are forbidden.
const ALLOWLIST = new Map([
  [
    "src/lib/auth/context/organization-context.repository.ts:10:organizationMember.findFirst",
    "Login bootstrap intentionally chooses the user's earliest active membership before an organization context exists.",
  ],
  [
    "src/lib/core/offers/offer-public-link.service.ts:24:quote.findFirst",
    "Public offer lookup has no authenticated organization context; a unique SHA-256 token hash is its reviewed capability boundary and the select list excludes internal fields.",
  ],
  [
    "src/lib/core/offers/offer-public-actions.service.ts:30:quote.findFirst",
    "Public offer actions have no authenticated organization context; the unique SHA-256 token hash is the reviewed capability boundary before organization-scoped transactional writes.",
  ],
]);

const models = parseModels(fs.readFileSync(SCHEMA_PATH, "utf8"));
const directScopedModels = new Set(models.filter((model) => /^\s*organizationId\s+/mu.test(model.body)).map((model) => model.name));
const scopedModels = new Map([...directScopedModels].map((name) => [name, "organizationId"]));
for (const [name, scopePath] of RELATION_SCOPED_MODELS) scopedModels.set(name, scopePath);

const violations = [];
const usedAllowlist = new Set();
let guardedCalls = 0;

for (const file of collectSourceFiles(SOURCE_ROOT)) {
  const relativeFile = path.relative(ROOT, file).split(path.sep).join("/");
  const source = fs.readFileSync(file, "utf8");
  const callPattern = /\bprisma\.(\w+)\.(findMany|findFirst|findUnique|update|updateMany|delete|deleteMany|count|aggregate|upsert)\s*\(/gu;
  for (const match of source.matchAll(callPattern)) {
    const clientModel = match[1];
    const method = match[2];
    if (!GUARDED_METHODS.has(method)) continue;
    const modelName = clientModel[0].toUpperCase() + clientModel.slice(1);
    const scopePath = scopedModels.get(modelName);
    if (!scopePath) continue;
    guardedCalls += 1;
    const openParen = match.index + match[0].lastIndexOf("(");
    const end = findMatchingParen(source, openParen);
    const line = source.slice(0, match.index).split("\n").length;
    const key = `${relativeFile}:${line}:${clientModel}.${method}`;
    const callSource = end === -1 ? source.slice(openParen) : source.slice(openParen, end + 1);
    if (hasOrganizationScope(callSource, scopePath)) continue;
    const exception = ALLOWLIST.get(key);
    if (exception?.trim()) {
      usedAllowlist.add(key);
      continue;
    }
    violations.push(`${key} (${modelName} requires ${scopePath})`);
  }
}

const staleAllowlist = [...ALLOWLIST.keys()].filter((key) => !usedAllowlist.has(key));
if (staleAllowlist.length) {
  console.error(`Organization scoping guard has stale exceptions:\n${staleAllowlist.join("\n")}`);
  process.exit(1);
}
if (violations.length) {
  console.error(`Organization scoping guard failed (${violations.length} violations):\n${violations.join("\n")}`);
  process.exit(1);
}
console.log(`Organization scoping guard passed (${scopedModels.size} scoped models, ${guardedCalls} guarded Prisma calls, ${usedAllowlist.size} justified exceptions).`);

function hasOrganizationScope(callSource, scopePath) {
  if (/\borganizationId\b/u.test(callSource)) return true;
  const relation = scopePath.split(".")[0];
  return relation !== "organizationId" && new RegExp(`\\b${relation}\\s*:\\s*\\{[\\s\\S]*?\\borganizationId\\b`, "u").test(callSource);
}

function findMatchingParen(source, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "(") depth += 1;
    if (char === ")" && --depth === 0) return index;
  }
  return -1;
}

function parseModels(schema) {
  return [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gmu)].map((match) => ({ name: match[1], body: match[2] }));
}

function collectSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(fullPath);
    return /\.(ts|tsx)$/u.test(entry.name) ? [fullPath] : [];
  });
}
