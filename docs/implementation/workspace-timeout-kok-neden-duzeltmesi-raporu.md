# Workspace Timeout Kök Neden Düzeltmesi — Uygulama Raporu

## Uygulanan değişiklikler

- OpenAI çağıran API route'larına `export const maxDuration = 60` eklendi.
- `openai-provider.ts` içindeki üç OpenAI istemcisi açıkça
  `timeout: 45_000, maxRetries: 1` ile yapılandırıldı.
- Classification çağrısını yapan `conversation-understanding.service.ts`
  istemcisine aynı ayarlar eklendi.
- `buildOpenAiRequestErrorMessage`, `AiProviderRequestError`, hata mesajları ve
  retry sonrasındaki uygulama davranışı değiştirilmedi.

## Route denetimi

Briefte verilen metin grep'i ham olarak 3 dosya döndürdü: 2 gerçek route
(`ai/chat`, `onboarding/discovery`) ve route dizini altındaki 1 test dosyası.
Briefin açıkça zorunlu tuttuğu `customers/actions/create-command` bu metin
grep'inde görünmüyor; OpenAI adapter'ını transitif çağırıyor.

Doğrudan SDK kullanımları ve route → adapter → provider çağrı zincirleri ayrıca
denetlendi. Böylece gerçek OpenAI çağıran toplam 9 route bulundu ve dokuzunun
tamamı güncellendi:

1. `src/app/api/ai/chat/route.ts`
2. `src/app/api/ai/chat/voice/tts/route.ts`
3. `src/app/api/customers/[customerId]/actions/edit-command/route.ts`
4. `src/app/api/customers/actions/create-command/route.ts`
5. `src/app/api/customers/document-extractions/route.ts`
6. `src/app/api/customers/field-definitions/actions/command/route.ts`
7. `src/app/api/onboarding/discovery/route.ts`
8. `src/app/api/onboarding/voice/tts/route.ts`
9. `src/app/api/quotes/[quoteId]/actions/edit-command/route.ts`

`npx next build` tarafından oluşturulan
`.next/server/functions-config-manifest.json`, bu dokuz route'un her biri için
`"maxDuration": 60` içeriyor. Yerel build değeri kabul etti; otomatik olarak daha
düşük bir değere çekme veya build/deploy hatası oluşmadı. Production Vercel plan
kabulü ancak deploy sırasında ayrıca doğrulanabilir.

## Doğrulama

- `npx tsc --noEmit` → geçti.
- Değişen 11 TypeScript dosyasında `npx eslint ...` → geçti.
- `node scripts/check-organization-scoping.mjs` → geçti
  (`74 scoped models / 256 guarded Prisma calls / 3 justified exceptions`).
- `npx vitest run` → 293 dosya geçti, 8 atlandı; 2231 test geçti, 17 atlandı.
- `npx next build` → başarılı. Repoda önceden bulunan, bu değişikliklerle ilgisiz
  lint uyarıları listelendi; build'i engelleyen hata oluşmadı.
- `git diff --check` → geçti.

## Gerçek OpenAI reprodüksiyonu

Bu oturumun process ortamında `OPENAI_API_KEY` tanımlı değildi. Bu nedenle
`/api/ai/chat` rotasına gerçek sağlayıcı çağrısı yapılarak classification/response
süreleri ölçülemedi. API anahtarı olmadan sahte bir süre kanıtı üretmek yerine
statik doğrulama, tam test paketi ve production build manifestiyle yetinildi.

## Teslim durumu

Brief gereği commit ve push yapılmadı.
