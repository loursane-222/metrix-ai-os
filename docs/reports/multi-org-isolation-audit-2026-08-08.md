# Multi-organization isolation audit — 2026-08-08

## Scope

- Prisma models: 60
- Organization-scoped models: 49 (47 direct `organizationId`, 2 required parent relations)
- Guarded direct `prisma.<model>` calls after remediation: 210
- Initial mechanical candidates: 30
- Confirmed direct-query violations fixed: 27
- Additional transaction-client violation fixed during review: 1
- Already-safe shared-filter aliases normalized for static proof: 2
- Justified exceptions: 1

## Fixed violations

- `src/app/api/company/assets/[assetId]/route.ts` — `companyAsset.update`
- `src/app/api/company/field-values/route.ts` — `companyDynamicFieldValue.update`
- `src/app/api/customers/document-extractions/[attachmentRef]/candidates-applied/route.ts` — `customerDocumentAttachment.update`
- `src/lib/action-runtime/domains/company/index.ts` — `companyDynamicFieldValue.update`
- `src/lib/core/collection-actions/collection-action-event.repository.ts` — event deduplication and event listing
- `src/lib/core/collection-actions/collection-action.repository.ts` — open-action lookup
- `src/lib/core/conversations/conversation.repository.ts` — conversation lookup and three message-history loaders
- `src/lib/core/executive-actions/executive-action-engine.service.ts` — three lifecycle updates
- `src/lib/core/memories/memory.repository.ts` — memory lookup
- `src/lib/core/notifications/notification.repository.ts` — read-state update
- `src/lib/core/quotes/quote-event.repository.ts` — transaction-client event deduplication and two event listings
- `src/lib/customers/customer-document-attachment.service.ts` — expired attachment cleanup and conversation binding
- `src/lib/executive-mind-runtime/__tests__/executive-mind-runtime.db.integration.test.ts` — scoped integration-fixture update
- `src/lib/field-authority/custom-field.service.ts` — custom-field definition update
- `src/lib/field-authority/customer-document-extraction-route-service.ts` — extraction completion update
- `src/lib/integrations/gmail/gmail.service.ts` — disconnect, token refresh, success and failure status mutations

The two canonical customer fact queries already shared an organization-scoped `where` object. They were inlined so the permanent static guard can prove the scope without unsafe data-flow assumptions.

## Justified exception

- `src/lib/auth/context/organization-context.repository.ts:10` — login bootstrap deliberately selects a user's earliest active membership before an organization context exists. The query is user-scoped and is the operation that establishes the initial organization context.

The exception is exact (file, line, Prisma model and method), carries a mandatory reason, and becomes a guard failure if it turns stale.

## Enforcement decision

The guard runs in `npm run build`. Organization isolation is a release correctness boundary, and exact reasoned exceptions keep the false-positive risk low enough for build-blocking enforcement. CI-only enforcement would allow unsafe local production builds.

## Adversarial evidence

One real-PostgreSQL suite creates organizations A and B and proves:

1. canonical business facts queried as A contain only A's customer;
2. an Action Runtime `customer.update` executed with A context cannot mutate B's customer;
3. the history loaders used by `/api/ai/chat` return neither B's conversation nor B's messages when called with A context.

Command: `RUN_DATABASE_INTEGRATION=1 npx vitest run src/lib/multi-org-isolation/__tests__/multi-org-isolation.db.integration.test.ts --reporter=verbose`

Result: 3/3 passed.
