# METRIX Ürün Yol Haritası v1

**Durum:** Murat'ın 2026-08-07 tarihli önceliklendirmesi, ürün direktörü rolüyle düzenlendi ve eksiksizlik kontrolünden geçirildi. Sıra Murat'ın verdiği sıra — değiştirilmedi, yalnızca her madde somut alt-kalemlere ayrıldı ve bu oturumda bulunan açık maddeler doğru yere yerleştirildi.

**Kaynak belgeler:** Bu yol haritası `docs/constitution/source/metrix-buyuk-resim-vizyon-v1.md` (büyük resim), `docs/constitution/METRIX FOUNDATION/METRIX_Etkileşim.docx` (dokuz imza etkileşim — bugün yeniden yüklendi, kalıcı arşive eklendi), `executive-cognitive-stack-v1.md` ve bu oturumdaki tüm denetim raporlarıyla (`docs/constitution/reports/`) çapraz kontrol edildi.

---

## 1. Metrix'in tüm yetenekleriyle sorunsuz yaşaması

Kapsam: karakter, öğrenme, tam sistem yönetimi, muhakeme, takip, iletişim, etkileşim.

**Devam eden/tamamlanan:**
- Karakter/ton (Leadership DNA + STANCE + yasaklı jenerik cümleler) — bağlandı, doğrulandı.
- Her zaman gerçek METRIX'in konuşması (3 eski bypass kapatıldı) — kod okunarak doğrulandı.
- Aynı turda derin muhakeme (progressive enrichment) — çalışıyor.
- Cognitive Stack Faz 1 (konuşmadan bağımsız durum taşıyıcısı) — az önce tamamlandı, push bekliyor.

**Bu maddenin altına eklenmesi/karar bekleyenler:**
- **Mimari isim çakışması — ÇÖZÜLDÜ (2026-08-07):** `docs/constitution/source/executive-cognitive-stack-v2.md` — Eylem Motoru ve Karar Motoru gerçekten Stack'e bağlanıyor (Faz 10/11, görev metni yazıldı: `METRIX_TASK_BRIEF_cognitive-stack-faz10-11.md`), İletişim Motoru ve Orkestrasyon Motoru kasıtlı olarak ayrı, henüz başlamamış fazlar (12/13) olarak bırakıldı. Murat onayladı.
- **Dokuz İmza Etkileşimi (`METRIX_Etkileşim.docx`) tamamlanma durumu:** 6 Ağustos denetiminde 0/9 tam, 3/9 kısmi bulunmuştu; sonrasında 6 tanesi (Cognitive Stack'e bağlı olmayanlar) implementasyona alındı, `2ad5f2f`'e kadar kabul edildi (bkz. `METRIX_HANDOFF.md`). Kalan 3 (**Executive Pause**, **Sessiz Hazırlık**, **Verinin Ağırlığı**) bilinçli olarak Cognitive Stack'e bağlı bırakılmıştı.
  - **Yeniden doğrulandı (2026-08-08):** Cognitive Stack hâlâ yalnızca Faz 1'de (davranış üretmeyen taşıyıcı katman) — Decision Runtime (Faz 5) hiç başlamadı, kodda bu üç imzanın adı bile geçmiyor. Erteleme gerekçesi bu haliyle geçerliliğini koruyor.
  - **Ama üçü için de gerçek, üretimde zaten akan alternatif sinyal bulundu** — Cognitive Stack'i beklemeden, sahte sinyal üretmeden şimdi bağlanabilirler: Executive Pause → `decisionCalibration` (`executive-directive/contracts.ts`, her turda dolduruluyor), Sessiz Hazırlık → `ResolutionConfidence` (`executive-request-resolution/entity-resolution.types.ts`), Verinin Ağırlığı → `SalesGoal` gerçek eşikleri (`core/goals/goal.types.ts`). Görev metni yazıldı: `METRIX_TASK_BRIEF_ertelenen-uc-imza-mevcut-sinyal.md`.
- **Belgede yazan, resmi bir kural olduğunu şimdi öğrendiğimiz şey:** "Hiçbir etkileşim ilk yanıtın 1 saniyenin altında başlaması hedefini bozmaz" — yani 1 saniye hedefi Murat'ın bugün koyduğu değil, zaten canonical bir kural. Ayrıca **Executive Pause** kademeli bir gecikme modeli tanımlıyor (basit bilgi 0–150ms, yönetim değerlendirmesi 300–650ms, stratejik karar 700–1100ms) — Madde 2'nin hedefini tekdüze değil, mesaj karmaşıklığına göre kademeli düşünmemiz gerekiyor (bkz. Madde 2).
- Türkçe metin kalitesi: guard tüm 282 dosyayı tarıyor ama yalnızca ilk 6 dosyadaki ihlaller düzeltildi, geri kalan (~123 olabilir) doğrulanmadı.
- Test verisi hijyeni: daha önce çözüldü (izole acceptance ortamı zorunlu kılındı) — yalnızca gözlem, aksiyon gerekmiyor.
- Kod içi isim çakışması (`buildExecutiveDecisionPackage` vs `buildExecutiveDecisionResult`) — kullanıcı deneyimini etkilemiyor, düşük öncelikli temizlik.
- `METRIX_Etkileşim.docx`'in kendi "Gelecekteki Planlama Sohbetinde Yanıtlanacak Sorular" listesi (hangi state hangi etkileşimi tetikler, mobil/masaüstü/sesli ayrışması, prototip vs MVP kapsamı, düşük donanım modu, telemetri, Dosya Açılımı'nın Living Workspace'e yeni yetki yaratmadan bağlanması, Altın İplik'in canonical evidence graph'tan üretilmesi, Ortam Yansıması için tek kanonik şirket-sağlığı state'i, Executive Stroke'un zorunlu/yasak olduğu risk sınıfları) — Cognitive Stack derinleştikçe tek tek cevaplanmalı.

## 2. Sesli sohbet — yetenek kaybı olmadan en hızlı ilk ses (hedef ~1sn)

**Güncelleme (`METRIX_Etkileşim.docx`'ten):** 1 saniye hedefi zaten canonical bir kural, ama tekdüze değil — Executive Pause modeline göre kademeli olmalı: basit bilgi anında, yönetim değerlendirmesi ~300–650ms, yüksek riskli stratejik karar bilinçli olarak ~700–1100ms duraklayabilir (gecikme değil, "düşünce ağırlığı" hissi).

**Bugünkü durum:** İlk ses ~2.18sn (bugünkü optimizasyondan sonra), asıl darboğaz OpenAI'ın kendi provider/network süresi (~%50'si) + TTS başlatma (~560ms) — kolay kazanımlar tükendi. Tam 1 saniyeye inmek için muhtemelen açılış cümlesi için ayrı/daha hızlı bir model denemesi gerekecek — kimlik/kalite kaybetmeden mümkün mü, ayrı bir araştırma turu gerektiriyor.

## 3. Domainlerin tamamlanması

`docs/constitution/METRIX FOUNDATION/Domain_Sözleşme/` altındaki 29 domain anayasasına göre. Bu oturumda bulundu: Kurucu Anayasa'nın sentezi bu domain'lerin "Intelligence" bölümlerini (Tahsilat: Promise-to-Pay, Müşteri: Duplicate Resolution/Privacy, Finansal: Multi-Company, Entegrasyon: Provider Independence gibi) sistematik olarak atlamış — domain tamamlama çalışmasına başlarken yalnızca Kurucu Anayasa'ya değil, ilgili Domain Sözleşmesi'nin kendisine bakılmalı. Murat "bunlar sonra" dedi, sıra korundu.

## 4. Metrix'in sistemde tam yetkisi (oku/değerlendir/raporla/kanaat/değiştir/yeni kayıt/sil), sesli+yazılı

**Bu maddenin altına eklenenler:**
- **Onay (approval) kayıtları hâlâ kalıcı değil** (bellek-içi `Map`, sunucu yeniden başlarsa kaybolur) — riskli işlemler için gerçek yetki bütünlüğü istiyorsan bu, "tam yetki güvenle kullanılsın" gereksiniminin bir parçası.
- **Belge yükleyip müşteri oluşturma akışı** (vergi levhası → yeni müşteri) kod olarak büyük ölçüde var görünüyor ama canlıda hiç uçtan uca doğrulanmadı (yerel sunucu hatası yüzünden yarım kalmıştı) — bu maddenin "yeni olay kaydedebilme" kısmının somut bir testi.
- **Multi-organization veri izolasyonu — ÖNCELİK YÜKSELTİLDİ (2026-08-07):** Murat'ın "1000 ayrı kullanıcı" ölçek talebiyle artık Madde 5'i beklemeden ele alınıyor. Görev metni yazıldı: `METRIX_TASK_BRIEF_multi-org-izolasyon-denetimi.md` — sistematik statik denetim + kalıcı otomatik guard (Türkçe metin guard'ıyla aynı desen) + adversarial iki-organizasyon testi.

## 5. Ana kullanıcı → alt kullanıcı ekleme/yetkilendirme + bildirim sistemi

**Büyük ölçüde tamamlanmış — düzeltme (2026-08-08):** Bu maddenin altındaki "Faz 2 hiç implemente değil" notu YANLIŞTI, kod okunmadan yazılmıştı. Gerçek durum: davet+rol ataması (Faz 1) kabul edildi; alan/kayıt görünürlüğü (`src/lib/field-authority/field-visibility.ts` — OWNER/EXECUTIVE/MANAGER SENSITIVE dahil her şeyi görür, TEAM_LEAD INTERNAL'a kadar, EMPLOYEE yalnız PUBLIC) zaten kodda ve `METRIX_HANDOFF.md`'nin kabul listesinde ("Alan görünürlüğü — Faz 2, kanıt yenileme dahil", commit `79a3967`); serbest hedefli bildirim (`notification-recipient-resolver.ts` — isimle veya rolle "yöneticime bildir" gibi doğal dil hedefleme) da `METRIX_HANDOFF.md` kabul listesinde ("Bildirim deneyimi + serbest hedef fan-out"). Kalan tek somut boşluk: otomatik/proaktif tetikleyiciler (örn. "bitmiş iş fotoğrafı çekilince otomatik yöneticiye gitsin") — bu, genel altyapı değil, belirli bir iş akışı; ayrı, küçük bir görev olarak ele alınabilir, madde bütünüyle açık değil. **KAPANDI (2026-08-28).** Roadmap'in kendi örneği (foto tetikleyicisi) METRIX'in gerçek domain'lerinde karşılığı olmayan varsayımsal bir senaryoydu; onun yerine zaten gerçek, modellenmiş iki risk durumu seçildi — teslimat FAILED_DELIVERY ve sipariş ON_HOLD (ikisi de bu oturumda daha önce `business-overview-synthesis.service.ts`'de risk sinyali olarak işaretlenmişti). `notifyWithOwnerFanout` zaten var olan altyapı üzerinden `delivery.transitionStatus`/`order.transitionStatus` handler'larına bağlandı — task.create'deki aynı non-critical side-effect deseniyle. Commit `fe6f038`.

## 6. Görsel tasarım dili tutarlılığı (yeniden tasarım olasılığı)

Murat'ın "değiştirmek isteyebilirim" dediği alan. Doğrudan bağlantılı: dokuz imza etkileşiminin (Madde 1'de detaylandı) şu anki uygulanma durumu ve `METRIX_Etkileşim.docx`'teki "Nihai Tasarım Ölçütü" ("kullanıcı arayüzün 'animasyonlu' olduğunu düşünmemeli, yalnız METRIX'in davranışlarının anlamlı olduğunu hissetmeli"). Yeniden tasarım kararı verilmeden önce Madde 1'deki dokuz-imza durum denetimi tazelenmeli — hangisi gerçekten yaşıyor, hangisi hâlâ değişmemiş, yeniden tasarım bunların üstüne mi kurulacak yoksa sıfırdan mı.

## 7. CRM/ERP/muhasebe verilerini METRIX'e aktarma (kullanıcı dostu import sistemi)

Yeni madde, önceki oturumlarda ele alınmadı. Kapsam netleştirilmesi gerekiyor: hangi formatlar (CSV, doğrudan entegrasyon API'leri, popüler Türkiye CRM/ERP/muhasebe programları — Logo, Mikro, Netsis gibi) hedefleniyor, bu ayrı bir keşif turu gerektirir.

## 8. Ayarlar ikonu — başlıkların düzenlenmesi ve çalışır hale getirilmesi

Ses seçimi, dark/light arayüz, hesap ayarları. Mevcut ayarlar ekranının gerçek durumu (hangi başlıklar zaten var, hangileri sahte/işlevsiz) hiç denetlenmedi — bu maddeye başlarken önce kısa bir keşif gerekir.

## 9. Admin sayfası + abonelik ödeme + hesap aktif/pasif otomasyonu

Yeni madde. Gerçek bir iş kurulumu kararı içeriyor (ödeme sağlayıcısı seçimi gibi) — Muhasebe Faz 3'teki e-Fatura entegratör kararına benzer şekilde, teknik değil ticari bir karar önce netleşmeli.

## 10. KVKK ve kullanım koşulları

Yeni madde. Hukuki bir belge — Cowork bunu bir avukat değildir, taslak/çerçeve hazırlanabilir ama nihai onay için hukuki danışmanlık önerilir.

---

## Eksiksizlik kontrolü — bu oturumda bulunup listenle eşleşmeyen başka madde yok

Şirket vizyonu (`metrix-buyuk-resim-vizyon-v1.md`), Cognitive Stack dokümanı, tüm domain sözleşmeleri, Temmuz+Ağustos denetim raporları ve `METRIX_Etkileşim.docx` tek tek tarandı — yukarıdaki 10 maddenin dışında, aksiyon gerektiren, hiçbir maddeye sığmayan açık bir bulgu kalmadı. `METRIX_Etkileşim.docx` artık kalıcı olarak `docs/constitution/METRIX FOUNDATION/` içinde — bir daha kaybolmayacak.

---

## Güncelleme — 2026-08-26 (3 haftalık aradan sonra yeniden doğrulandı)

Bu belge 07-08 Ağustos'ta yazıldı; git geçmişi + doğrudan kod okuması ile yeniden kontrol edildi. Bazı maddeler bu belgenin kendi yazıldığı tarihte bile güncelliğini yitirmişti (aynı gün içinde ilerlemiş), diğerleri gerçekten 3 hafta değişmeden kaldı.

- **Madde 1 — kısmen eskimiş, düzeltildi.** "Kalan 3 imza (Executive Pause, Sessiz Hazırlık, Verinin Ağırlığı) Cognitive Stack'e bağlı bırakıldı" notu **eskimiş**: aynı gün (2026-08-08, birkaç saat sonra) commit `4120978` üçünü de gerçek sinyallere bağladı — `src/lib/executive-signatures/executive-pause.ts`, `silent-preparation-runtime.ts`, `data-weight.ts` kodda mevcut ve test edilmiş. Türkçe metin kalitesi guard'ı da ilerledi (`turkish-text-guard.test.ts`, commit `8cf070e`, 2026-08-14) — artık 22 kritik executive dosyasını kalıcı/otomatik koruyor, ama 282 dosyanın tamamı hâlâ kapsanmıyor. **Güncelleme (2026-08-28): bu alt-madde de eskimiş.** `scripts/check-user-facing-text.mjs` (her `npm run build`'da çalışır) artık `src/lib/executive-*` altındaki her dosyayı dinamik olarak topluyor, sabit bir listeye bağlı değil — şu anda 297 dosyayı tarıyor ve hepsi temiz geçiyor (`npm run check:text-quality` doğrudan çalıştırılarak doğrulandı). Kapsam boşluğu kapanmış.
- **Madde 2 — değişmedi.** Sesli ilk-cevap gecikmesi için yeni bir optimizasyon veya "açılış cümlesi için ayrı hızlı model" denemesi bulunamadı; darboğaz (OpenAI provider/network) hâlâ çözülmedi.
- **Madde 3 — ayrı, daha güncel bir denetimde:** `docs/constitution/reports/METRIX_Domain_Tamamlama_Denetimi_2026-08-23.md` (ve bugünkü 2026-08-26 eki).
- **Madde 4 — eskimiş, düzeltildi.** "Onay kayıtları hâlâ bellek-içi Map" iddiası bu belge yazıldığı anda bile **yanlıştı**: kalıcı Prisma-destekli onay deposu (`src/lib/action-runtime/policy/approval-store.ts`, `createPrismaApprovalStore`, üretimde `NODE_ENV !== "test"` iken aktif) commit `dd8f0e2` ile **2026-07-25**'te zaten girmişti — roadmap'in yazıldığı 08-07/08'den önce. 2026-08-23'te (`95b46b9` + migration `20260824090000_add_orchestration_approval_flow`) orkestrasyon planlayıcısına da aynı kalıcı onay akışı (`AWAITING_APPROVAL`, `approvalRequestId`) bağlandı. Multi-org izolasyonu da ayrı, tamamlanmış bir iş: `docs/reports/multi-org-isolation-audit-2026-08-08.md` + `src/lib/multi-org-isolation/` + commit `c6201c2` (2026-08-08), o tarihten sonra ek commit yok (durağan, aksiyon gerektirmiyor). Belge-yükleme→müşteri akışının canlı uçtan uca doğrulanması hâlâ yapılmadı — bu tek alt-madde geçerliliğini koruyor.
- **Madde 5, 8, 9, 10 — değişmedi.** Proaktif bildirim tetikleyicileri hâlâ yok (madde 5); `/metrix` altında bir ayarlar rotası hâlâ yok (madde 8); ödeme sağlayıcısı/abonelik koduna dair hiçbir iz yok (madde 9); KVKK hâlâ hukuki taslak bekliyor (madde 10).
- **Madde 6 — ön koşul artık karşılandı, karar hâlâ bekleniyor.** Madde 1'in dokuz-imza durumu artık tazelendi (kalan 3 imza de bağlı) — yeniden tasarım kararı için beklenen ön koşul karşılanmış durumda, ama kararın kendisi hâlâ verilmedi.
- **Madde 7 — ayrı, paralel bir incelemede netleşti** (bkz. Domain Tamamlama Denetimi'nin 2026-08-26 eki, satır 28 Entegrasyon): genel Excel/CSV import çerçevesi (10 domain, format-agnostik) zaten var; gerçek kalan boşluk canlı API senkronu, webhook alıcısı ve bağımsız bir "integration" adapter girişi — küçük bir cila değil, orta-büyük yeni bir alt-sistem.

**Sonuç:** 10 maddeden 2'si (1, 4) bu belgenin kendi yazıldığı tarihte bile yanlıştı/eskimişti — ikisi de düzeltildi. 1 madde (6) ön koşulu şimdi karşılandı ama karar hâlâ açık. 1 madde (7) kapsamı netleşti. Geri kalan 5 madde (2, 5, 8, 9, 10) 3 haftadır değişmedi.

---

## Güncelleme — 2026-08-26 (Murat'ın kararları)

- **Madde 6 — KAPANDI.** Murat görsel tasarımı bu Claude Code oturumunun dışında, Gemini ve Codex ile ayrıca yürütüyor (Codex şu anda daily brief'in görsel tasarımını değiştiriyor). Bu roadmap'in kapsamı dışına alındı — bir daha bu oturumda ele alınmayacak. **Not: Codex daily-briefing/executive-daily-briefing-v2 dosyalarında eşzamanlı çalışıyor olabilir — bu alanlara paralel dokunmaktan kaçın, çakışma riski var.**
- **Madde 9 — KARAR VERİLDİ (uygulama beklemede).** Şirket henüz kurulmadığı için ödemeler Murat'ın kişisel Shopier hesabı üzerinden alınacak. Birkaç abone gelmeye başlayınca şirket kurulup aylık abonelik ödeme sistemine (gerçek ticari altyapı) geçilecek. Şimdilik bir uygulama görevi yok — bu, ne zaman/nasıl başlanacağına dair bir ön karar; Murat ayrıca "şimdi başlayalım" demeden Shopier entegrasyonuna girişilmeyecek.
- **Madde 8 — KISMEN İLERLEDİ (2026-08-27).** Ayarlar ekranı denetlendi: mevcut hâli yalnızca "Metrix Filmi" + "Çıkış Yap" idi, roadmap'te adı geçen 3 alt-başlığın (ses seçimi, dark/light, hesap ayarları) hiçbiri yoktu. **Hesap ayarları (ad-soyad, e-posta, saat dilimi) tamamlandı ve deploy edildi** (commit `b711873`) — yeni `GET/PATCH /api/user/profile`, `SettingsMenu`'ye "Hesap Ayarları" girişi. Kalan 2 alt-başlık hâlâ açık: **ses seçimi** (altyapı var — `voice-preference-authority.ts` — ama tek global env var'a bağlı, kullanıcı/organizasyon başına DB alanı+API+UI gerekiyor), **dark/light** (hiçbir altyapı yok, tüm renkler hardcoded — Madde 6'nın dışında ayrı ele alınacaksa önce bu karar netleşmeli, çünkü Codex/Gemini'nin dıştaki görsel yeniden tasarımıyla çakışma riski var).
  - **Ses seçimi — KAPANDI (2026-08-28).** `User.voicePreference` (nullable, timezone/language ile aynı desen) eklendi, `resolveVoiceAuthorityForUser` kullanıcının kayıtlı tercihini env varsayılanının önüne koyuyor, Hesap Ayarları'na "Ses" dropdown'u eklendi. Canlıda uçtan uca doğrulandı: kaydetme, sayfa yenilemesi sonrası kalıcılık, gerçek TTS/realtime session route'larının doğru sesi kullanması. Commit `947c245`. dark/light hâlâ açık.

## Güncelleme — 2026-08-28

- **Madde 4'ün belge-yükleme→müşteri akışı alt-maddesi — DOĞRULANDI.** "Canlıda hiç uçtan uca doğrulanmadı" notu artık geçerli değil: gerçek dev sunucusuna karşı, gerçek OpenAI vision API'siyle, `qa-screenshots/belge-yukleme-test-vergi-levhasi.png` test belgesi kullanılarak tam zincir çalıştırıldı — yükleme, çıkarım (firma adı/vergi no/vergi dairesi doğru okundu, mevcut olmayan alanlar dürüstçe "belgede yok" olarak işaretlendi), duplicate kontrolü (temiz), taslağa uygulama. Hepsi beklendiği gibi çalıştı, kod değişikliği gerekmedi — bu yalnızca bir doğrulama turuydu. Son adım (customer.create action-runtime handler'ı üzerinden gerçek kayıt) zaten mevcut otomatik testlerle kapsanıyor, ayrıca doğrulanmadı.
