# OpenAI Sağlayıcı Hatalarında Gerçek Sebebi Logla — Uygulama Raporu

## Kapsam

`src/lib/ai/providers/openai-provider.ts`'deki üç `console.error("[AIProvider]", ...)`
noktasına `error.message`, `error.status` (mevcut `getErrorStatus` helper'ı) ve
`error.code` (yeni `getErrorCode` helper'ı) eklendi. `errorType` alanı aynen kaldı.
`buildOpenAiRequestErrorMessage`'a (yani `AiProviderRequestError`'a giden mesaja)
hiç dokunulmadı — davranış/hata mesajı değişmedi, yalnızca log genişledi.

## Değişen dosya

- [openai-provider.ts](../../src/lib/ai/providers/openai-provider.ts)
  1. `createOpenAiProvider().generateResponse` catch bloğu (satır ~94) — log
     genişletildi.
  2. `getErrorCode` helper'ı eklendi (`getErrorStatus`'un yanına, aynı desen).
  3. `logProviderRequestFailure` (satır ~229, `createOpenAiStream`'in hem
     `textStream` hem `getFinalMeta` yolundan çağrılıyor) — log genişletildi.
  4. `createOpenAiResearchProvider().generateResearch` catch bloğu (satır ~340) —
     brief'in belirttiği gibi önceden HİÇ log yoktu, yalnızca throw ediyordu;
     aynı log deseni eklendi.

## Gizlilik kontrolü

Brief'in istediği gibi kontrol edildi: OpenAI Node SDK'sının `APIError` sınıfı
`error.message`'a ham API anahtarını koymuyor — anahtar ilgili hatalarda (`invalid_api_key`
vb.) SDK/servis tarafından zaten maskelenmiş biçimde geçiyor (ör. `sk-...` önekiyle
kısaltılmış). Şüpheli/riskli bir alan bulunmadı, `error.message`/`status`/`code`
loglamak güvenli.

## Doğrulama

- `npx tsc --noEmit` → geçti.
- `npx eslint src/lib/ai/providers/openai-provider.ts` → geçti.
- Bu dosyayı dolaylı kapsayan mevcut testler (`provider-policy.test.ts`,
  `ai-gateway.streaming.contract.test.ts`) → geçti, kırılma yok.
- `node scripts/check-organization-scoping.mjs` → geçti (74/256/3, değişmedi —
  bu değişiklik Prisma çağrısı içermiyor).
- `npx vitest run` (tam paket, filtresiz, tek sefer) → **293 dosya geçti, 8
  atlandı; 2231 test geçti, 17 atlandı — önceki fazla birebir aynı sayılar,
  davranış değişikliği olmadığını doğruluyor.**
- `npx next build` → başarılı.

## Commit/Push

Yapılmadı — brief talimatı gereği rapor teslim edildi.
