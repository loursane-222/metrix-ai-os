-- Customer Foundation (Faz 1) — Backfill Strategy
--
-- STATUS: NOT EXECUTED. This file is intentionally outside prisma/migrations/
-- so it is never auto-applied by `prisma migrate deploy` (see
-- scripts/production-migrate.mjs). It must be run manually, once, after the
-- 20260714120000_customer_foundation migration has been applied.
--
-- WHAT THIS DOES
-- Person(type='CUSTOMER') rows are today the only identity Quote/Payment/
-- CollectionAction actually transact against (via personId). This script
-- gives each such Person a canonical Customer counterpart, without touching
-- personId anywhere — the existing AI chain (executive-brain, customer
-- portfolio/health intelligence) keeps reading personId unchanged; customerId
-- is populated in parallel.
--
-- RULE: NO AUTOMATIC MERGE BY NAME SIMILARITY
-- A Person whose name matches an EXISTING Customer is NEVER linked to it by
-- this script. Name similarity is evidence for a human to review, not grounds
-- for an automatic decision — a wrong merge is much harder to undo than a
-- duplicate row. SECTION 0 below reports those candidates and stops; it does
-- not write anything. SECTION 1 only creates brand-new Customer rows for
-- Persons that have NO existing name match at all (an unambiguous case, not a
-- merge decision), and only links a Person to a Customer it just created in
-- this same transaction — never to a pre-existing one. Attaching a Person to
-- one of the SECTION 0 candidates requires a separate, explicitly-reviewed
-- statement that is intentionally not part of this file.

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 0 — MANUAL REVIEW REQUIRED (read-only: no INSERT, no UPDATE, no DELETE)
-- ═══════════════════════════════════════════════════════════════════════════
-- Every row returned here is a Person(CUSTOMER) whose name matches an
-- existing Customer. This script does NOT act on these rows. A human must
-- look at each candidate and decide, per row, whether it is really the same
-- company before any CustomerContact is created for it.

SELECT
  p.id AS person_id,
  p."organizationId",
  p."fullName" AS person_full_name,
  p.phone AS person_phone,
  p.email AS person_email,
  c.id AS candidate_customer_id,
  c."displayName" AS candidate_customer_name
FROM "Person" p
JOIN "Customer" c
  ON c."organizationId" = p."organizationId"
  AND lower(trim(c."displayName")) = lower(trim(p."fullName"))
WHERE p.type = 'CUSTOMER'
  AND NOT EXISTS (
    SELECT 1 FROM "CustomerContact" cc WHERE cc."personId" = p.id
  )
ORDER BY p."organizationId", p."fullName";

-- Summary counts for the same read-only review (still no writes).
SELECT
  p."organizationId",
  count(*) FILTER (WHERE c.id IS NOT NULL) AS candidate_matches_needing_manual_review,
  count(*) FILTER (WHERE c.id IS NULL)     AS unambiguous_new_customers_section_1_will_create
FROM "Person" p
LEFT JOIN "Customer" c
  ON c."organizationId" = p."organizationId"
  AND lower(trim(c."displayName")) = lower(trim(p."fullName"))
WHERE p.type = 'CUSTOMER'
  AND NOT EXISTS (SELECT 1 FROM "CustomerContact" cc WHERE cc."personId" = p.id)
GROUP BY p."organizationId";

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1 — EXECUTION (deterministic, unambiguous cases only)
-- ═══════════════════════════════════════════════════════════════════════════
-- Only touches Persons that have NO existing Customer name match at all
-- (i.e. every row SECTION 0 reported above is excluded from everything below).
-- Wrapped in a single transaction: either all three writes apply, or none do.

BEGIN;

-- 1a. Create a Customer only where no existing Customer name-matches this Person.
INSERT INTO "Customer" (
  id, "organizationId", "displayName", phone, email,
  "balanceCents", currency, status, source, "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  p."organizationId",
  p."fullName",
  p.phone,
  p.email,
  0,
  'TRY',
  'ACTIVE',
  'MIGRATED_FROM_PERSON',
  now(),
  now()
FROM "Person" p
WHERE p.type = 'CUSTOMER'
  AND NOT EXISTS (
    SELECT 1 FROM "Customer" c
    WHERE c."organizationId" = p."organizationId"
      AND lower(trim(c."displayName")) = lower(trim(p."fullName"))
  )
  AND NOT EXISTS (
    SELECT 1 FROM "CustomerContact" cc WHERE cc."personId" = p.id
  );

-- 1b. Link each such Person to the Customer just created for them in 1a.
-- The join is restricted to source='MIGRATED_FROM_PERSON', which only rows
-- inserted by 1a (in this same transaction) carry — no application code path
-- sets that value, so this can never attach to a pre-existing Customer and
-- can never touch a SECTION 0 candidate.
INSERT INTO "CustomerContact" (
  id, "organizationId", "customerId", "personId", "fullName", phone, email,
  "isPrimary", source, "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  p."organizationId",
  c.id,
  p.id,
  p."fullName",
  p.phone,
  p.email,
  true,
  'MIGRATED_FROM_PERSON',
  now(),
  now()
FROM "Person" p
JOIN "Customer" c
  ON c."organizationId" = p."organizationId"
  AND lower(trim(c."displayName")) = lower(trim(p."fullName"))
  AND c.source = 'MIGRATED_FROM_PERSON'
WHERE p.type = 'CUSTOMER'
  AND NOT EXISTS (
    SELECT 1 FROM "CustomerContact" cc WHERE cc."personId" = p.id
  );

-- 1c. Populate customerId on Quote / Payment / CollectionAction — restricted
-- to the links just created in 1b (cc.source='MIGRATED_FROM_PERSON'), so this
-- never populates customerId from a SECTION 0 candidate either. personId is
-- left untouched everywhere.
UPDATE "Quote" q
SET "customerId" = cc."customerId"
FROM "CustomerContact" cc
WHERE cc."personId" = q."personId"
  AND cc.source = 'MIGRATED_FROM_PERSON'
  AND q."customerId" IS NULL
  AND q."personId" IS NOT NULL;

UPDATE "Payment" pay
SET "customerId" = cc."customerId"
FROM "CustomerContact" cc
WHERE cc."personId" = pay."personId"
  AND cc.source = 'MIGRATED_FROM_PERSON'
  AND pay."customerId" IS NULL
  AND pay."personId" IS NOT NULL;

UPDATE "CollectionAction" ca
SET "customerId" = pay."customerId"
FROM "Payment" pay
WHERE pay.id = ca."paymentId"
  AND ca."customerId" IS NULL
  AND pay."customerId" IS NOT NULL;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2 — Post-run verification (read-only)
-- ═══════════════════════════════════════════════════════════════════════════
-- remaining_manual_review_candidates should match SECTION 0's count exactly —
-- SECTION 1 must never reduce it, since it never touches those rows.
SELECT
  (SELECT count(*) FROM "Person" WHERE type = 'CUSTOMER') AS total_customer_persons,
  (SELECT count(*) FROM "CustomerContact" WHERE source = 'MIGRATED_FROM_PERSON') AS contacts_created_by_section_1,
  (
    SELECT count(*)
    FROM "Person" p
    JOIN "Customer" c
      ON c."organizationId" = p."organizationId"
      AND lower(trim(c."displayName")) = lower(trim(p."fullName"))
    WHERE p.type = 'CUSTOMER'
      AND NOT EXISTS (SELECT 1 FROM "CustomerContact" cc WHERE cc."personId" = p.id)
  ) AS remaining_manual_review_candidates,
  (SELECT count(*) FROM "Quote" WHERE "personId" IS NOT NULL AND "customerId" IS NULL) AS quotes_still_unlinked,
  (SELECT count(*) FROM "Payment" WHERE "personId" IS NOT NULL AND "customerId" IS NULL) AS payments_still_unlinked;
