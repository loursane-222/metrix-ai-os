# Takvim Faz 1 — Kanonik Model Uygulama Raporu

## Uygulanan kapsam

- `CalendarEvent`, doğrulanmış member/customer katılımcıları ve durum geçmişi additive Prisma migration ile eklendi.
- Tekrarlama tek kanonik satırda saklanıyor; günlük/haftalık/aylık/yıllık occurrence'lar sorgu aralığında hesaplanıyor.
- Yaşam döngüsü server-side geçiş grafiğiyle ve her geçiş için history kaydıyla korunuyor.
- Organizasyon-scoped liste/oluşturma/detay/güncelleme/yeniden planlama/durum API'leri eklendi.
- Living Workspace artık Task üzerinden vekâleten değil, gerçek `calendar` domain'i ve `/metrix/calendar` rotası üzerinden çalışıyor.
- Mevcut Task/Invoice/Payment/CollectionAction vade agregasyonu korundu. Gerçek olaylar ikinci kaynak olarak eklenerek tüm-gün bandı, durum renk sınıfları, form ve gerçek olaylarla sınırlı sürükle-bırak yeniden planlama sağlandı.
- Aktif sohbet girişine takvim navigasyonu ile bugün/yarın ve haftanın yedi günü için saatli temel olay oluşturma eklendi; olay çözümleyicisi exact-match ardından containment uygular.
- Gün adı bugünle aynıysa ileri saat bugüne, geçmiş/eşit saat sonraki haftaya; farklı gün adı ise o günün bir sonraki gerçekleşmesine çözümlenir. Pazartesi–pazar vakaları gerçek `executeActiveConversationExtension` girişinden test edilir.

## Ekran ve etkileşim kanıtı

Playwright acceptance testi `TAKVIM FAZ1 ACCEPTANCE {suffix}` organizasyonu, gerçek `CalendarEvent` kayıtları ve gerçek Görev/Fatura/Tahsilat vadeleriyle çalıştı. Test `locator.waitFor({ state: "visible" })` ve `waitForLoadState("networkidle")` kullanır; sabit zaman beklemesi kullanmaz. Drag/drop sonrası yeni tarih hem ekranda hem DB'de `expect.poll` ile doğrulanır. `finally` temizliği organizasyonu siler ve aynı acceptance adıyla kalan organizasyon sayısının sıfır olduğunu assert eder.

- `qa-screenshots/takvim-faz1-ay-gorunumu.png`
- `qa-screenshots/takvim-faz1-hafta-gorunumu.png`
- `qa-screenshots/takvim-faz1-gun-gorunumu.png`
- `qa-screenshots/takvim-faz1-olay-olusturma.png`
- `qa-screenshots/takvim-faz1-surukle-yeniden-planlama.png`
- `qa-screenshots/takvim-faz1-odunc-veri-regresyon.png`

Kanıt altyapısı: `e2e/takvim-faz1-kanit.acceptance.e2e.ts` ve `playwright.takvim-faz1.config.ts`.

## Bilinçli kapsam dışı (Faz 2+)

- Tekrarlayan serinin tek occurrence'ına istisna uygulama.
- Yaklaşıyor/gerçekleşiyor durumlarını DB'de saklama veya bunlar için cron.
- RSVP/davet kabul-red akışı ve meeting intelligence.
- Apple/iCloud ya da Google Calendar senkronizasyonu.
- Çalışma saatleri, tatiller ve çoklu-kullanıcı zaman dilimi zekâsı.
- Müsaitlik, kapasite, çakışma, executive ritim ve toplantı zekâsı.
- “Önümüzdeki ayın ilk pazartesi”, “öğleden sonra” ve “ilk boş saat” gibi muğlak/karmaşık NLU.

## Veri sınırları

İlişkili görev, müşteri ve sipariş yalnızca açık ID ile bağlanır ve aynı organizasyonda doğrulanır. Katılımcı yalnızca gerçek `OrganizationMember` veya `Customer` olabilir. Ödünç vade kayıtları Takvim'de salt-okunurdur.
