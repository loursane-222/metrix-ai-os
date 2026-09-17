-- Live delivery now carries the same generic TurnResult/presentation shape
-- the text turn already returns, replacing the legacy per-domain
-- WorkspaceDirective. Forward-safe: the old directive* columns held only
-- ephemeral, TTL-bounded delivery state (never business truth), and the
-- Live delivery bridge no longer reads or writes them.
ALTER TABLE "LiveSession" ADD COLUMN "turnResultVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LiveSession" ADD COLUMN "turnResultJson" TEXT;
ALTER TABLE "LiveSession" ADD COLUMN "turnResultIssuedAt" TIMESTAMP(3);

ALTER TABLE "LiveSession" DROP COLUMN "directiveVersion";
ALTER TABLE "LiveSession" DROP COLUMN "directiveJson";
ALTER TABLE "LiveSession" DROP COLUMN "directiveIssuedAt";
