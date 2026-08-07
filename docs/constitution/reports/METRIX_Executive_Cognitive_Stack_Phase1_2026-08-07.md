# METRIX Executive Cognitive Stack — Faz 1 İnşa Raporu

Tarih: 2026-08-07

## Stage A — İsim ayrıştırması

- Konuşma turuna ait geçici `ExecutiveMindState`, davranış değişmeden
  `ConversationTurnMindState` olarak yeniden adlandırıldı.
- Kanıt: TypeScript kontrolü ile tam Vitest paketi geçti (262 dosya, 2.087 test;
  10 test atlandı).
- Commit: `6ba5ec4`

## Stage B — Kalıcı Mind State taşıyıcısı

- Organizasyon başına tek `ExecutiveMindRuntimeStateRecord` eklendi.
- Taşıyıcı yalnızca attention focus, working memory ve zaman/doğrulama seviyesi
  bulunan hypothesis/belief görüntülerini saklar; route, gateway ve prompt zincirine
  bağlı değildir ve davranış üretmez.
- Gerçek PostgreSQL entegrasyon testi, konuşma A tamamlandıktan ve aynı
  organizasyonda konuşma B oluşturulduktan sonra görüntünün okunabildiğini doğruladı.
- Kanıt: Prisma validate/generate/migrate geçti; DB entegrasyonunda 2 test, tam
  pakette 263 dosya ve 2.088 test geçti (11 test atlandı).
- Commit: `19918a6`

Kurucu Mimari Kontrolü:

1. Anayasaya uygun mu? Evet. Katman pasif ve izole; davranış/prompt üretmiyor.
2. Yayılabilir mi? Evet. Organizasyon-tekil ve sürümlü görüntü, sonraki fazların
   ayrı tüketiciler olarak eklenmesine uygun.
3. Kalıcı mı? Evet. PostgreSQL kaydı konuşma yaşam döngüsünden bağımsız; yalnızca
   organizasyon silinirse cascade ile silinir.

## Stage C — İlk ses

Uçtan uca authenticated voice senaryosu, aynı nakit-akışı mesajıyla tek worker'da
üçer tekrar çalıştırıldı. Süreler tur başlangıcından ilk PCM byte'a kadardır.

| Ölçüm | Önce | Sonra |
|---|---:|---:|
| İlk ses / ilk PCM byte (yayınlanmış baz) | 2.278 ± 422 ms | 2.176 ± 184 ms |
| Bu oturumdaki ham 3-tur ortalaması | 3.337 ms | 2.176 ms |
| Açılış ilk chunk (son 3 tur) | — | 1.477 ± 138 ms |
| TTS isteğinin başlatılması (son 3 tur) | — | 1.613 ± 215 ms |
| TTS başlangıcı → ilk PCM byte | — | 563 ± 33 ms |

Son üç ilk-byte ölçümü: 1.916 / 2.320 / 2.292 ms. Yayınlanmış stabil baza
göre iyileşme 102 ms (%4,5); bu oturumdaki gürültülü ham baza göre 1.161 ms
(%34,8). Kısa, en az dört kelimelik ve 24–42 karakterlik ilk konuşma birimi,
tam cümleyi beklemeden TTS'e gönderiliyor. Eksik token ve zayıf bağlaç sınırları
flush edilmiyor. Native realtime içerik üretimi açılmadı.

Kalan alt sınır iki parçadır: METRIX açılışının ilk kelimelerini üretme süresi
(bu ölçümde ortalama 1.477 sn) ve OpenAI TTS ağ/model ilk-byte süresi (ortalama
563 ms). Route auth/body ayrıştırma/provider başlangıcı ayrıca zaman çizelgesine
eklendi.
