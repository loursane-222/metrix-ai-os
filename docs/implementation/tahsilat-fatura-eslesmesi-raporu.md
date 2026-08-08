# Tahsilat ↔ Fatura Eşleştirmesi — Uygulama Raporu

Tarih: 2026-08-08

## Uygulanan değişiklikler

- `prisma/schema.prisma:876-912`: `Payment.invoiceId String?`, nullable `Invoice` relation ve index eklendi. `Invoice` modeline `payments Payment[]` geri bağlantısı eklendi (`:1830-1832`). `quoteId` korunmuştur.
- `prisma/migrations/20260808190000_add_payment_invoice_relation/migration.sql:1-9`: yalnızca nullable kolon, index ve `ON DELETE SET NULL` foreign key ekleyen additive-only migration.
- `src/lib/core/payments/payment.types.ts`, `payment.repository.ts:16-30`, `payment.service.ts:32-97,105-145,226-236`: opsiyonel `invoiceId` doğrulaması/oluşturma akışına eklendi. Customer ve organization sahipliği doğrulanıyor.
- `src/app/api/payments/route.ts:15-22,57-72`: Payment list/oluşturma çıktısına `invoiceNumber` ve `invoiceTitle` eklendi.
- `src/lib/core/invoices/invoice.repository.ts` ve `src/app/api/invoices/route.ts:5-20`: Invoice listesine bağlı tahsilatlar dahil edildi; `paymentCount` ve insan-dilinde `paymentReferences` üretildi.
- `src/lib/living-workspace/planner.ts`, `contracts.ts`, `domain-adapters.ts`: canonical Payment/Invoice yüzeylerinin ilişki alanları allowlist’e eklendi.
- `src/components/living-workspace/CanonicalDomainSurface.tsx:29-38,65-66`: tahsilat satırında fatura numarası/adı; fatura detayında tahsilat sayısı ve referansları gösteriliyor.

## Kapanış davranışı

`applyPaymentAmount` aynı Prisma transaction’ı içinde bağlı fatura için tüm bağlı Payment kayıtlarının `paidAmount` toplamını hesaplıyor. Toplam `Invoice.totalAmount` eşiğine ulaştığında Invoice `PAID` oluyor; kısmi ödeme `SENT` bırakıyor. `invoiceId` olmayan legacy Payment akışı ve ledger/CollectionAction davranışı korunuyor.

## Doğrulama

- `npx prisma migrate deploy`: `20260808190000_add_payment_invoice_relation` başarıyla uygulandı.
- Additive migration özeti: mevcut kolon/tablo silme veya değiştirme yok; yalnız `Payment.invoiceId` nullable kolon, index ve foreign key.
- Gerçek PostgreSQL entegrasyon testi: `src/lib/core/payments/__tests__/payment-invoice.integration.test.ts` geçti — tam ödeme `PAID`, kısmi ödeme `SENT`, invoiceId’siz legacy ödeme çalıştı ve null kaldı.
- İlgili Vitest koşusu: 26 test geçti, 1 mevcut entegrasyon testi environment nedeniyle skip edildi.
- `npx prisma validate`, `npx tsc --noEmit`, text-quality guard, organization-scoping guard ve production build geçti.
- İzole kabul verisiyle canonical yüzey kanıtları:
  - [Tahsilat satırında fatura referansı](../../qa-screenshots/tahsilat-fatura-eslesmesi-payment.png)
  - [Fatura detayında tahsilat referansı](../../qa-screenshots/tahsilat-fatura-eslesmesi-invoice.png)

## Geriye dönük veri ve kapsam

Mevcut Payment kayıtları otomatik eşleştirilmedi; `invoiceId` değerleri null kalıyor. `Payment.quoteId` korunuyor. e-Fatura/e-Defter, banka mutabakatı ve Order/Delivery/Supplier/Stock/Production kapsam dışıdır. Bu fazda commit/push yapılmadı.
