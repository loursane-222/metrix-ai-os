# Şirket Performans Sinyali — Faz A Uygulama Raporu

## Kapsam

`executive-operating-context-builder.service.ts`'de sabit `null` dönen 4 alanı
(`executiveForecast`, `goalIntelligence`, `customerHealthIntelligence`,
`companyPerformanceSignal`) zaten var olan gerçek builder fonksiyonlarına
bağladım; `executiveAwareness` ve `customerPortfolioIntelligence` kapsam dışı
bırakılıp `null` olarak korundu.

## Değişen dosyalar

- [executive-operating-context-builder.service.ts](../../src/lib/executive-operating-context/executive-operating-context-builder.service.ts)
  — `memoryContext` ayrı `const`'a çıkarıldı (davranış aynı); `listSalesGoals`,
  `buildExecutiveGoalIntelligence`, `buildCustomerHealthIntelligence`,
  `buildExecutiveForecast`, `buildCompanyPerformanceSignal` çağrıları eklendi;
  4 sabit `null` gerçek değerlerle değiştirildi.
- [financial-health-reconnection.test.ts](../../src/lib/executive-operating-context/__tests__/financial-health-reconnection.test.ts)
  — bu fazda dokunulan `buildExecutiveOperatingContext`'i mock'lu prisma ile
  çağıran mevcut (repo'da commitlenmemiş) test, yeni prisma-bağımlı çağrılar
  (`listSalesGoals`, `buildCustomerHealthIntelligence`,
  `buildExecutiveForecast`) yüzünden `Cannot read properties of undefined
  (reading 'findMany')` ile kırıldı; bu üç fonksiyon için mock eklenerek
  regresyon giderildi (fix bu fazın kapsamındaki değişikliğin doğrudan yan
  etkisi, ayrı bir bug değil).

## Yeni testler (greenfield, dosya başına ilk unit test)

- [executive-management-review-engine.service.test.ts](../../src/lib/executive-management-review/__tests__/executive-management-review-engine.service.test.ts)
  — `companyPerformanceSignal: null` regresyonu (DATA_INSUFFICIENT'a düşer,
  COMPANY_PERFORMANCE_CRITICAL/TOP_POSITIVE_SIGNAL üretilmez); gerçekçi
  CRITICAL sinyal → COMPANY_PERFORMANCE_CRITICAL; gerçekçi STRONG sinyal →
  TOP_POSITIVE_SIGNAL.
- [executive-prioritization-engine.service.test.ts](../../src/lib/executive-prioritization/__tests__/executive-prioritization-engine.service.test.ts)
  — null ve LOW-confidence sinyal aynı sabit fallback skorunu üretir (regresyon);
  gerçek HIGH-confidence CRITICAL sinyal farklı ve daha yüksek skor üretir;
  PRESSURED < CRITICAL skor sıralaması `performanceLevel`'a tutarlı.
- [executive-operating-rhythm-engine.service.test.ts](../../src/lib/executive-operating-rhythm/__tests__/executive-operating-rhythm-engine.service.test.ts)
  — CRITICAL sinyal TODAY adayını ve CRITICAL postürü tetikler; null/STABLE
  sinyal tetiklemez; PRESSURED+DECELERATING postürü PRESSURED yapar ve
  THIS_MONTH adayını tetikler.
- [executive-reporting-engine.service.test.ts](../../src/lib/executive-reporting/__tests__/executive-reporting-engine.service.test.ts)
  — `companyPerformanceSignal`+`executiveScorecard` null iken
  `monthly_executive_summary` bölümü `INSUFFICIENT_DATA`/`isFallback: true`;
  gerçek veriyle `GENERATED`/`isFallback: false`.

## Kabul kanıtı (entegrasyon testi)

[company-performance-signal-reconnection.db.integration.test.ts](../../src/lib/executive-operating-context/__tests__/company-performance-signal-reconnection.db.integration.test.ts)
— gerçek PostgreSQL'e karşı, izole bir organizasyon oluşturup gerçek Quote
(WON), Payment (PAID), Expense (PAID), SalesGoal (MONTHLY/ACTIVE) kayıtları
yazıp `buildExecutiveOperatingContext` çağırıyor; `companyPerformanceSignal`,
`executiveForecast`, `goalIntelligence`, `customerHealthIntelligence`'ın artık
`null` olmadığını ve en az bir `componentScores` alanının dolu olduğunu
doğruluyor. Mevcut 3 emsal (`*.db.integration.test.ts`) dosyayla aynı desen:
`RUN_DATABASE_INTEGRATION=1` olmadan `describe.skip` ile atlanır.

**Not:** Bu test bilinçli olarak `RUN_DATABASE_INTEGRATION=1` ile çalıştırılıp
gerçek DB'ye yazılarak doğrulanmadı — repodaki tek `DATABASE_URL` paylaşılan/
production-benzeri bir Supabase örneğini gösteriyor; canlı DB'ye yazma yetkisi
onayınız olmadan kullanılmadı. Test tip kontrolünden ve lint'ten geçti, aynı
iskeleti kullanan 3 emsal dosyayla birebir aynı güvenlik kapısına (env flag)
sahip. İsterseniz `RUN_DATABASE_INTEGRATION=1 npx vitest run <dosya>` ile siz
çalıştırabilirsiniz.

## Doğrulama

- `npx tsc --noEmit` → geçti.
- `npx eslint <dokunulan dosyalar>` → geçti (uyarı/hata yok).
- `node scripts/check-organization-scoping.mjs` → geçti (74 scoped model, 256
  guarded Prisma call, 3 justified exception — yeni `listSalesGoals`/
  `buildCustomerHealthIntelligence` çağrıları organizasyon kapsamlı, guard
  script tarafından görüldü).
- `npx vitest run` (tam paket, filtresiz, tek sefer) → **292 dosya geçti, 8
  atlandı (DB-integration gate); 2218 test geçti, 17 atlandı.**
- `npx next build` → başarılı.
- `git status` incelendi; bu fazın dışındaki değişiklikler (docs, qa-screenshots,
  METRIX_TASK_BRIEF_*.md vb.) önceki oturumlardan kalma, dokunulmadı.

## Commit/Push

Yapılmadı — brief talimatı gereği rapor teslim edildi, commit/push ayrı bir
brief ile talep edilecek.
