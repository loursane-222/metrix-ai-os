#!/usr/bin/env node

/**
 * Demo data seed script for local development.
 * Seeds MemoryItem, Person, Quote, and Payment records for a given organization.
 * All seeded records are marked with metadata.seedDemo = true for safe reset.
 *
 * Usage:
 *   node scripts/seed-demo.mjs --org-id=<uuid>                    # dry-run
 *   node scripts/seed-demo.mjs --org-id=<uuid> --confirm          # write to DB
 *   node scripts/seed-demo.mjs --org-id=<uuid> --confirm --reset  # reset + re-seed
 *   node scripts/seed-demo.mjs --help
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

// --- Env loading (mirrors db-preflight.mjs) ---

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

// --- CLI args ---

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const orgId = args["org-id"];
const confirm = args.confirm === true;
const reset = args.reset === true;

if (!orgId) {
  console.error("Error: --org-id=<uuid> is required.");
  console.error("Run with --help for usage.");
  process.exit(1);
}

if (reset && !confirm) {
  console.error("Error: --reset requires --confirm.");
  process.exit(1);
}

// --- Host guard ---

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
const blockedReason = BLOCKED_HOST_PARTS.find((part) => host.includes(part));
if (blockedReason) {
  console.error(`Error: DATABASE_URL uses blocked host "${host}" (matches "${blockedReason}").`);
  console.error("This script only runs against local databases.");
  process.exit(1);
}

if (!SAFE_HOSTS.has(host)) {
  console.error(`Error: DATABASE_URL host "${host}" is not in the safe hosts list.`);
  console.error(`Safe hosts: ${[...SAFE_HOSTS].join(", ")}`);
  process.exit(1);
}

// --- Seed data definitions ---

const DEMO_MEMORY_ITEMS = [
  {
    subjectType: "ORGANIZATION",
    type: "FACT",
    key: "musteri_sayisi",
    value: "47 aktif müşteri, 12 tanesi bu yıl kazanıldı",
  },
  {
    subjectType: "ORGANIZATION",
    type: "FACT",
    key: "acik_teklif_tutari",
    value: "₺230,000 değerinde 8 bekleyen teklif, ortalama karar süresi 12 gün",
  },
  {
    subjectType: "ORGANIZATION",
    type: "FACT",
    key: "bekleyen_tahsilat",
    value: "₺85,000 vadesi geçmiş tahsilat, 3 müşteri 45+ gün gecikmiş",
  },
  {
    subjectType: "ORGANIZATION",
    type: "FACT",
    key: "en_onemli_musteriler",
    value: "Beta Yapı (yıllık ₺320k), Alfa Güvenlik (yıllık ₺180k), Mert Tekstil (yeni müşteri)",
  },
  {
    subjectType: "ORGANIZATION",
    type: "FACT",
    key: "personel_durumu",
    value: "12 çalışan aktif, 2 pozisyon açık: saha teknisyeni ve satış temsilcisi",
  },
  {
    subjectType: "ORGANIZATION",
    type: "STRATEGIC",
    key: "kisa_vadeli_oncelik",
    value: "Ağustos sonuna kadar 3 büyük teklifin kapatılması kritik",
  },
  {
    subjectType: "ORGANIZATION",
    type: "STRATEGIC",
    key: "nakit_akisi",
    value: "Nakit pozisyonu stabil; en büyük risk ₺85,000 gecikmiş tahsilat",
  },
  {
    subjectType: "ORGANIZATION",
    type: "PROCESS",
    key: "teklif_sureci",
    value: "Teklifler 2 gün içinde müşteriye iletiliyor, onay ortalama 12 gün sürüyor",
  },
];

const DEMO_PEOPLE = [
  {
    type: "CUSTOMER",
    fullName: "Beta Yapı Ltd.",
    title: "İnşaat Yüklenicisi",
    notes: "En büyük müşteri; ₺85,000 açık bakiye, 45+ gün gecikmiş tahsilat",
  },
  {
    type: "CUSTOMER",
    fullName: "Alfa Güvenlik A.Ş.",
    title: "Güvenlik Sistemleri",
    notes: "3 yıldır çalışıyoruz, sadık müşteri",
  },
  {
    type: "CUSTOMER",
    fullName: "Mert Tekstil San.",
    title: "Tekstil Üreticisi",
    notes: "Yeni müşteri; ilk büyük projesi devam ediyor",
  },
  {
    type: "EMPLOYEE",
    fullName: "Ahmet Yılmaz",
    title: "Satış Müdürü",
    notes: "5 yıldır şirkette, teklif sürecini yönetiyor",
  },
  {
    type: "EMPLOYEE",
    fullName: "Zeynep Kara",
    title: "Saha Teknisyeni",
    notes: "En yüksek müşteri memnuniyet skoru, yeni personel alımına dahil",
  },
];

const DEMO_QUOTES = [
  {
    customerName: "Beta Yapı Ltd.",
    title: "Mermer Kaplama Projesi A",
    status: "SENT",
    amount: "65000",
    currency: "TRY",
    notes: "Büyük ölçekli kaplama; müşteri onayı bekleniyor",
  },
  {
    customerName: "Beta Yapı Ltd.",
    title: "Zemin Döşeme İşleri",
    status: "SENT",
    amount: "42000",
    currency: "TRY",
    notes: null,
  },
  {
    customerName: "Alfa Güvenlik A.Ş.",
    title: "Güvenlik Merkezi Zemin Kaplaması",
    status: "SENT",
    amount: "55000",
    currency: "TRY",
    notes: "Teknik şartname müşteriye iletildi",
  },
  {
    customerName: "Alfa Güvenlik A.Ş.",
    title: "Yıllık Bakım ve Onarım",
    status: "VIEWED",
    amount: "15000",
    currency: "TRY",
    notes: null,
  },
  {
    customerName: "Mert Tekstil San.",
    title: "Tekstil Fabrikası Zemin Projesi",
    status: "VIEWED",
    amount: "18000",
    currency: "TRY",
    notes: "Yeni müşteri; ilk teklif görüntülendi",
  },
  {
    customerName: "Beta Yapı Ltd.",
    title: "Duvar Kaplama Güncelleme",
    status: "NEGOTIATION",
    amount: "18000",
    currency: "TRY",
    notes: "Fiyat müzakeresi devam ediyor",
  },
  {
    customerName: "Alfa Güvenlik A.Ş.",
    title: "Kamera Odası Kaplama",
    status: "NEGOTIATION",
    amount: "12000",
    currency: "TRY",
    notes: null,
  },
  {
    customerName: "Mert Tekstil San.",
    title: "Ofis Zemin Yenileme",
    status: "DRAFT",
    amount: "5000",
    currency: "TRY",
    notes: "Taslak; henüz gönderilmedi",
  },
  {
    customerName: "Beta Yapı Ltd.",
    title: "Lobi Mermer Kaplama",
    status: "WON",
    amount: "48000",
    currency: "TRY",
    notes: "Kazanıldı; iş emri açıldı",
  },
  {
    customerName: "Diğer Müşteri",
    title: "Dış Cephe Kaplama",
    status: "LOST",
    amount: "32000",
    currency: "TRY",
    notes: "Rakip firma daha düşük fiyat verdi",
  },
];

const DEMO_PAYMENTS = [
  {
    title: "Lobi Mermer Kaplama — 1. Hak Ediş",
    customerName: "Beta Yapı Ltd.",
    quoteTitleMatch: "Lobi Mermer Kaplama",
    amount: "24000",
    paidAmount: "0",
    currency: "TRY",
    status: "OVERDUE",
    dueDate: new Date("2026-04-15"),
    paidAt: null,
    notes: "45 gün gecikmiş; müşteri ile takip görüşmesi yapılacak",
  },
  {
    title: "Güvenlik Sistemi Kurulum Bedeli",
    customerName: "Alfa Güvenlik A.Ş.",
    quoteTitleMatch: null,
    amount: "18000",
    paidAmount: "0",
    currency: "TRY",
    status: "OVERDUE",
    dueDate: new Date("2026-05-01"),
    paidAt: null,
    notes: "41 gün gecikmiş; hesap ekstresinden teyit bekleniyor",
  },
  {
    title: "Zemin Döşeme İşleri — Ara Hak Ediş",
    customerName: "Beta Yapı Ltd.",
    quoteTitleMatch: "Zemin Döşeme İşleri",
    amount: "42000",
    paidAmount: "20000",
    currency: "TRY",
    status: "PARTIAL",
    dueDate: new Date("2026-06-20"),
    paidAt: null,
    notes: "₺20,000 tahsil edildi; kalan ₺22,000 vade 20 Haziran",
  },
  {
    title: "Tekstil Fabrikası Zemin Projesi — Peşinat",
    customerName: "Mert Tekstil San.",
    quoteTitleMatch: null,
    amount: "5000",
    paidAmount: "5000",
    currency: "TRY",
    status: "PAID",
    dueDate: new Date("2026-05-31"),
    paidAt: new Date("2026-05-28"),
    notes: "Peşinat tam tahsil edildi",
  },
  {
    title: "Yıllık Bakım ve Onarım — 1. Dönem",
    customerName: "Alfa Güvenlik A.Ş.",
    quoteTitleMatch: "Yıllık Bakım ve Onarım",
    amount: "7500",
    paidAmount: "0",
    currency: "TRY",
    status: "PENDING",
    dueDate: new Date("2026-06-30"),
    paidAt: null,
    notes: "19 gün içinde vadesi dolacak",
  },
  {
    title: "Duvar Kaplama Güncelleme — İlk Hak Ediş",
    customerName: "Beta Yapı Ltd.",
    quoteTitleMatch: "Duvar Kaplama Güncelleme",
    amount: "9000",
    paidAmount: "0",
    currency: "TRY",
    status: "PENDING",
    dueDate: new Date("2026-07-15"),
    paidAt: null,
    notes: "Müzakere tamamlanırsa ödeme başlatılacak",
  },
];

const SEED_DEMO_MARKER = { seedDemo: true };
const PAYMENT_SEED_MARKER = { seedDemo: true, seedSource: "PAYMENT_DEMO_SEED_V1" };

// --- Main ---

console.log(`\nMetrix AI OS — Demo Seed Script`);
console.log(`Organization ID : ${orgId}`);
console.log(`Mode            : ${confirm ? (reset ? "RESET + SEED" : "SEED") : "DRY-RUN"}`);
console.log(`DB host         : ${host}\n`);

if (!confirm) {
  console.log("DRY-RUN: No changes will be made. Use --confirm to write.\n");
  printPreview();
  process.exit(0);
}

// --- Live run ---

const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("@prisma/client");

const adapter = new PrismaPg({ connectionString: dbUrl });
const prisma = new PrismaClient({ adapter });

try {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) {
    console.error(`Error: Organization not found: ${orgId}`);
    process.exit(1);
  }

  console.log(`Organization    : ${org.name}\n`);

  if (reset) {
    console.log("Resetting existing demo records...");
    const deletedPayments = await prisma.payment.deleteMany({
      where: { organizationId: orgId, metadata: { path: ["seedDemo"], equals: true } },
    });
    const deletedMemory = await prisma.memoryItem.deleteMany({
      where: { organizationId: orgId, metadata: { path: ["seedDemo"], equals: true } },
    });
    const deletedPeople = await prisma.person.deleteMany({
      where: { organizationId: orgId, metadata: { path: ["seedDemo"], equals: true } },
    });
    const deletedQuotes = await prisma.quote.deleteMany({
      where: { organizationId: orgId, metadata: { path: ["seedDemo"], equals: true } },
    });
    console.log(`  Deleted ${deletedPayments.count} Payment(s), ${deletedMemory.count} MemoryItem(s), ${deletedPeople.count} Person(s), ${deletedQuotes.count} Quote(s)\n`);
  }

  console.log("Seeding MemoryItems...");
  for (const item of DEMO_MEMORY_ITEMS) {
    await prisma.memoryItem.create({
      data: {
        organizationId: orgId,
        subjectType: item.subjectType,
        subjectId: orgId,
        type: item.type,
        key: item.key,
        value: item.value,
        source: "ONBOARDING",
        confidence: 95,
        status: "ACTIVE",
        isUserConfirmed: true,
        metadata: SEED_DEMO_MARKER,
      },
    });
    console.log(`  + [${item.type}] ${item.key}`);
  }

  console.log("\nSeeding People...");
  const seededPersonsByName = new Map();
  for (const person of DEMO_PEOPLE) {
    const created = await prisma.person.create({
      data: {
        organizationId: orgId,
        type: person.type,
        fullName: person.fullName,
        title: person.title,
        notes: person.notes,
        metadata: SEED_DEMO_MARKER,
      },
    });
    seededPersonsByName.set(person.fullName, created.id);
    console.log(`  + [${person.type}] ${person.fullName}`);
  }

  console.log("\nSeeding Quotes...");
  const seededQuotesByTitle = new Map();
  for (const quote of DEMO_QUOTES) {
    const created = await prisma.quote.create({
      data: {
        organizationId: orgId,
        customerName: quote.customerName,
        personId: seededPersonsByName.get(quote.customerName) ?? null,
        title: quote.title,
        status: quote.status,
        amount: quote.amount,
        currency: quote.currency,
        notes: quote.notes ?? undefined,
        metadata: SEED_DEMO_MARKER,
      },
    });
    seededQuotesByTitle.set(quote.title, created.id);
    console.log(`  + [${quote.status}] ${quote.customerName} — ${quote.title} (₺${Number(quote.amount).toLocaleString("tr-TR")})`);
  }

  console.log("\nSeeding Payments...");
  for (const payment of DEMO_PAYMENTS) {
    const personId = payment.customerName
      ? (seededPersonsByName.get(payment.customerName) ?? null)
      : null;
    const quoteId = payment.quoteTitleMatch
      ? (seededQuotesByTitle.get(payment.quoteTitleMatch) ?? null)
      : null;
    await prisma.payment.create({
      data: {
        organizationId: orgId,
        personId,
        quoteId,
        title: payment.title,
        amount: payment.amount,
        paidAmount: payment.paidAmount,
        currency: payment.currency,
        status: payment.status,
        dueDate: payment.dueDate,
        paidAt: payment.paidAt ?? undefined,
        notes: payment.notes,
        metadata: PAYMENT_SEED_MARKER,
      },
    });
    const linkParts = [
      personId ? `kişi:${payment.customerName}` : "kişisiz",
      quoteId ? `teklif:${payment.quoteTitleMatch}` : "teklifsiz",
    ];
    console.log(`  + [${payment.status}] ${payment.title} (₺${Number(payment.amount).toLocaleString("tr-TR")}) — ${linkParts.join(", ")}`);
  }

  console.log(`\nDone. Seeded ${DEMO_MEMORY_ITEMS.length} MemoryItems, ${DEMO_PEOPLE.length} People, ${DEMO_QUOTES.length} Quotes, and ${DEMO_PAYMENTS.length} Payments.`);
  console.log(`\nTo reset: node scripts/seed-demo.mjs --org-id=${orgId} --confirm --reset`);
} finally {
  await prisma.$disconnect();
}

// --- Helpers ---

function printPreview() {
  console.log(`Will seed ${DEMO_MEMORY_ITEMS.length} MemoryItem(s):`);
  for (const item of DEMO_MEMORY_ITEMS) {
    console.log(`  [${item.type}] ${item.key}`);
    console.log(`    → ${item.value}`);
  }

  console.log(`\nWill seed ${DEMO_PEOPLE.length} Person(s):`);
  for (const person of DEMO_PEOPLE) {
    console.log(`  [${person.type}] ${person.fullName} — ${person.title}`);
    console.log(`    notes: ${person.notes}`);
  }

  const openStatuses = new Set(["DRAFT", "SENT", "VIEWED", "NEGOTIATION"]);
  const openTotal = DEMO_QUOTES.filter((q) => openStatuses.has(q.status)).reduce(
    (sum, q) => sum + Number(q.amount),
    0,
  );
  console.log(`\nWill seed ${DEMO_QUOTES.length} Quote(s) (open pipeline: ₺${openTotal.toLocaleString("tr-TR")}):`);
  for (const quote of DEMO_QUOTES) {
    console.log(`  [${quote.status}] ${quote.customerName} — ${quote.title} (₺${Number(quote.amount).toLocaleString("tr-TR")})`);
  }

  const overdueTotal = DEMO_PAYMENTS
    .filter((p) => p.status === "OVERDUE")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  console.log(`\nWill seed ${DEMO_PAYMENTS.length} Payment(s) (vadesi geçmiş: ₺${overdueTotal.toLocaleString("tr-TR")}):`);
  for (const payment of DEMO_PAYMENTS) {
    const personHint = payment.customerName ? ` → kişi: ${payment.customerName}` : "";
    const quoteHint = payment.quoteTitleMatch ? `, teklif: ${payment.quoteTitleMatch}` : "";
    console.log(`  [${payment.status}] ${payment.title} (₺${Number(payment.amount).toLocaleString("tr-TR")})${personHint}${quoteHint}`);
    console.log(`    vade: ${payment.dueDate.toISOString().slice(0, 10)}, ödenen: ₺${Number(payment.paidAmount).toLocaleString("tr-TR")}`);
  }

  console.log(`\nAll records marked with metadata.seedDemo = true`);
  console.log(`\nTo run: node scripts/seed-demo.mjs --org-id=${orgId} --confirm`);
}

function printHelp() {
  console.log(`
Metrix AI OS — Demo Seed Script

Seeds MemoryItem, Person, Quote, and Payment records for local development.
All seeded records are marked with metadata.seedDemo = true.

Usage:
  node scripts/seed-demo.mjs --org-id=<uuid>                     dry-run (show what will be seeded)
  node scripts/seed-demo.mjs --org-id=<uuid> --confirm           write to DB
  node scripts/seed-demo.mjs --org-id=<uuid> --confirm --reset   delete demo records, then re-seed

Options:
  --org-id=<uuid>   (required) Target organization UUID
  --confirm         Write to database (default is dry-run)
  --reset           Delete existing demo records before seeding (requires --confirm)
  --help            Show this help

Safety:
  Only writes to local databases (localhost, 127.0.0.1, etc.)
  Only touches MemoryItem, Person, Quote, and Payment tables
  Blocked hosts: supabase.com, production, prod, vercel
`);
}

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    if (arg === "--confirm") {
      result.confirm = true;
    } else if (arg === "--reset") {
      result.reset = true;
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg.startsWith("--")) {
      const eqIndex = arg.indexOf("=");
      if (eqIndex !== -1) {
        const key = arg.slice(2, eqIndex);
        const value = arg.slice(eqIndex + 1);
        result[key] = value;
      } else {
        result[arg.slice(2)] = true;
      }
    }
  }
  return result;
}

function parseDbUrl(value) {
  try {
    const url = new URL(value);
    if (!url.hostname) return { ok: false };
    return { ok: true, host: url.hostname };
  } catch {
    return { ok: false };
  }
}

function loadDotEnvFile(fileName, options = {}) {
  const filePath = resolve(rootDir, fileName);
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed || (!options.override && process.env[parsed.key] !== undefined)) continue;
    process.env[parsed.key] = parsed.value;
  }
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const eqIndex = trimmed.indexOf("=");
  if (eqIndex === -1) return null;

  const key = trimmed.slice(0, eqIndex).trim();
  let value = trimmed.slice(eqIndex + 1).trim();
  if (!key) return null;

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}
