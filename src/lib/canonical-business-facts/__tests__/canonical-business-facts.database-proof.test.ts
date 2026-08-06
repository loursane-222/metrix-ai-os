import { config } from "dotenv";
import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";

config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

const CASES = [
  ["Customer", "Müşteri sayısı kaç?"], ["ProductService", "Ürünleri listele"],
  ["Quote", "Teklif sayısı kaç?"], ["Invoice", "Faturaları listele"],
  ["Payment", "Tahsilat sayısı kaç?"], ["Expense", "Giderleri listele"],
  ["Task", "Görev sayısı kaç?"], ["Person", "Kişileri listele"],
] as const;

describe.runIf(process.env.RUN_CANONICAL_DATABASE_PROOF === "1")("database proof", () => {
  let organizationId = "";
  beforeAll(async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const result = await client.query<{ id: string }>(`SELECT id FROM "Organization" WHERE name = 'Duru Mermer' LIMIT 1`);
    await client.end();
    organizationId = result.rows[0]!.id;
  });

  it.each(CASES)("matches independent SELECT COUNT(*) for %s", async (model, message) => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const raw = await client.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM "${model}" WHERE "organizationId" = $1`, [organizationId]);
    await client.end();
    const { readCanonicalBusinessFactsForMessage } = await import("../canonical-business-facts.service");
    const facts = await readCanonicalBusinessFactsForMessage({ organizationId, message });
    expect(facts[0]?.count).toBe(raw.rows[0]!.count);
    expect(facts[0]?.records).toHaveLength(raw.rows[0]!.count);
    console.info(`DATABASE_PROOF ${model} independent=${raw.rows[0]!.count} chatEvidence=${facts[0]?.count}`);
  });
});
