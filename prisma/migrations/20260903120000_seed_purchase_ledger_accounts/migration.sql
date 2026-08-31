-- Phase 9 remediation: purchase invoice postings require the canonical
-- inventory and input-VAT accounts. Existing canonical rows are preserved;
-- conflicting IDs or codes fail closed instead of accepting unsafe master data.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "LedgerAccount"
        WHERE "id" = 'ledger-account-153'
          AND ("code", "name", "type") IS DISTINCT FROM ('153', 'Ticari Mallar', 'ASSET'::"LedgerAccountType")
    ) THEN
        RAISE EXCEPTION 'LedgerAccount ledger-account-153 conflicts with canonical 153 Ticari Mallar (ASSET)';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "LedgerAccount"
        WHERE "code" = '153'
          AND "id" <> 'ledger-account-153'
    ) THEN
        RAISE EXCEPTION 'LedgerAccount code 153 is assigned to a non-canonical ID';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "LedgerAccount"
        WHERE "id" = 'ledger-account-191'
          AND ("code", "name", "type") IS DISTINCT FROM ('191', 'İndirilecek KDV', 'ASSET'::"LedgerAccountType")
    ) THEN
        RAISE EXCEPTION 'LedgerAccount ledger-account-191 conflicts with canonical 191 İndirilecek KDV (ASSET)';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "LedgerAccount"
        WHERE "code" = '191'
          AND "id" <> 'ledger-account-191'
    ) THEN
        RAISE EXCEPTION 'LedgerAccount code 191 is assigned to a non-canonical ID';
    END IF;

    INSERT INTO "LedgerAccount" ("id", "code", "name", "type", "updatedAt") VALUES
        ('ledger-account-153', '153', 'Ticari Mallar', 'ASSET', CURRENT_TIMESTAMP),
        ('ledger-account-191', '191', 'İndirilecek KDV', 'ASSET', CURRENT_TIMESTAMP)
    ON CONFLICT ("id") DO NOTHING;
END $$;
