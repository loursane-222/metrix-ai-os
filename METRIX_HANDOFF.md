# METRIX — Devir Notu (Sohbet Geçişi)

Bu dosya, önceki uzun sohbetin bittiği noktadan devam edebilmek için yazıldı. Yeni sohbete bu dosyayı okutarak veya içeriğini yapıştırarak başla.

## Rolüm / Çalışma Deseni

- METRIX'in ürün direktörüyüm (Murat). Sen (Claude), kod tabanını okuyup gerçek eksik/hata/mimari ihlalleri bulur, Türkçe `METRIX_TASK_BRIEF_<slug>.md` görev metinleri yazarsın (repo kökünde). Bunları ben Codex CLI veya Claude Code CLI'da çalıştırıp tamamlanma raporunu sana yapıştırıyorum.
- **Her "tamamlandı" raporunu, ajanın kendi özetine güvenmeden, gerçek git geçmişi/kod/testler üzerinden bağımsız doğrulaman şart.** Bu doğrulama şimdiye kadar defalarca gerçek sorun yakaladı (bkz. aşağıdaki "Doğrulamada Yakalanan Sorunlar").
- Doğruladıktan sonra sıradaki önceliği **sen karar verirsin** — onay beklemeden bir sonraki görev metnini yazıp devam edersin. Karar yetkisi bende değil, sende (açıkça verildi).
- Bu sandbox'ta git push yetkim yok; push'u ben kendi terminalimden yapıyorum. Sen yalnızca `git fetch` + `git rev-list --left-right --count origin/main...HEAD` ile senkron durumunu doğrularsın.
- Standart talimat: **"durmak yok, METRIX'i tam kapasite çalışır hale getirene kadar durmayacağız."** Onay beklemeden ilerle.

## Değişmez Ürün Kuralı: Tek Yüzey Mimarisi

- METRIX tek sayfalı bir üründür: tek konuşma sayfası, URL asla değişmez.
- "Workspace"ler ayrı rota/sayfa olarak AÇILMAZ — sohbet sayfasının içinde, ortada çerçeveli bir kart olarak açılır (`LivingWorkspaceHost.tsx`, `data-workspace-frame="centered"`).
- Workspace kartı hiçbir zaman üstteki header'ı veya alttaki chat input'unu (composer) EZMEZ — mobil dahil tüm cihazlarda.
- `ExecutiveAppShell.tsx`: `if (pathname !== "/") redirect("/");` — kök dışındaki tüm `/metrix/*` rotaları `/`'e geri döner.

## Şu Ana Kadar Doğrulanıp Kabul Edilen Commit'ler (sırayla)

1. Kabuk kaçağı (tek yüzey ihlali) düzeltmesi
2. Alan görünürlüğü (field-level sensitivity) — Faz 2, kanıt yenileme dahil (`79a3967`)
3. Bildirim deneyimi + serbest hedef fan-out
4. `ProductExperienceHost` mimari kopyasının tamamen silinmesi + `LivingWorkspaceHost`'a konsolidasyon (`2956517`)
5. Silinen customer rotalarının 404 yerine redirect'e çevrilmesi (`873dd6c`)
6. Workspace çerçeve ihlali düzeltmesi (`7212064`) — production'a deploy edildi
7. Kalıntı `router.push("/metrix...")` çağrılarının düzeltilmesi + regresyon testi (`1959f22`)
8. Kenarda Bekleme + Görevi Teslim Alma — server-backed pending approval kalıcılığı (`c0a349b`)
9. Executive Stroke uçtan uca — gerçek DB mutation doğrulaması (payment.apply bug'ı da bu sırada bulunup düzeltildi) (`f7e67bb`)
10. Ortam Yansıması + Altın İplik — ilk deneme (`9c3d05a`) **reddedildi** (çift context provider paylaşımı kırıyordu, kanıt eksikti), düzeltme (`2ad5f2f`) **kabul edildi**.

**Son kabul edilen commit: `2ad5f2f`** ("fix: share atmosphere assessment provider") — origin/main ile senkron.

## Doğrulamada Yakalanan Gerçek Sorunlar (ders çıkarılacak desenler)

- Zayıf/yanıltıcı ekran görüntüsü kanıtı (OWNER/EMPLOYEE ekran görüntüleri piksel piksel aynıydı — workspace kartı hiç render olmamıştı).
- Gizli mimari kopya: `ProductExperienceHost` sistemi, iki "düzeltilmiş" faza rağmen hiç dokunulmadan paralel çalışıyordu.
- Silinen rotalar 404'e düşüyordu (redirect stub'ı unutulmuştu).
- Konsolidasyon sonrası ölü rotalara işaret eden `router.push` çağrıları (kırık butonlar).
- Ödeme onayı mutation bug'ı: generic onay endpoint'i gerçek ödeme tutarını uygulamıyordu.
- **En son:** çift `AtmosphereAssessmentProvider` — iç içe iki React context instance'ı, biri diğerini gölgeliyordu; rapor "ortak context" dese de state paylaşılmıyordu. Kod okuyarak (React context kuralları üzerinden, çalıştırmadan) tespit edildi.

**Sonuç:** Rapor ne derse desin, her seferinde gerçek diff'i satır satır oku, render ağacını takip et, ölü/kırık referans için grep at.

## Sırada Ne Var

Dokuz imza denetiminin kendi öncelik sırasına göre bir sonraki adım: **ertelenen üç imza** —
- 03 Executive Pause
- 05 Sessiz Hazırlık
- 09 Verinin Ağırlığı

Bunlar denetimde bir "Decision Runtime / Cognitive Lifecycle katmanı"na bağlıydı ve "hâlâ kod değil" notuyla ertelenmişti. Yeni sohbette ilk iş: bu katmanın gerçekten hâlâ eksik olup olmadığını kod okuyarak yeniden doğrulamak (varsayma) — Cognitive Stack Faz 1'in tamamlanmış olması bu üç imzayı gündeme getirebilir.

## Ertelenmiş (ayrı görev değil, uygun bir fazın içine gömülecek)

- Sesli girdinin (voice) sistemdeki her input/buton için click/type ile tam paritesi. Mimari olarak zaten mevcut (ses/metin aynı conversation engine'i paylaşıyor) ama Universal Input Authority kaydı (`src/lib/input-authority/contracts.ts`) şu an yalnızca 11 dosyada var. Bağımsız bir görev değil — ileride uygun bir fazın kapsamına dahil edilecek.

## Anahtar Dosyalar / Kavramlar (hızlı referans)

- `src/components/living-workspace/LivingWorkspaceHost.tsx` — kanonik workspace host, `AtmosphereAssessmentProvider` burada (tek instance).
- `src/components/living-workspace/AtmosphereAssessmentContext.tsx` — paylaşılan atmosfer context'i, standalone fallback ile.
- `src/components/metrix-tab/MetrixChatTab.tsx` — sohbet motoru, `setAssessment` burada çağrılır.
- `src/components/executive-signatures/SignatureComponents.tsx` — `PendingWorkRail`, `ExecutiveStroke`, `HandoffNotice`, `EvidenceChain`.
- `src/components/executive-signatures/usePendingWork.ts` — 15sn'de bir server-backed onay kuyruğu.
- `e2e/*.authenticated.e2e.ts` — gerçek DB/Prisma doğrulamalı Playwright testleri (mock değil).
- `docs/constitution/` — METRIX anayasa zinciri (Foundation / Source / Standards) — her faz başında ilgili katmanlar okunmalı.
- Kök `CLAUDE.md` — METRIX Developer Constitution, her oturumda geçerli, üzerine yazılamaz.

## Doğrulama Komut Deseni

```
git fetch origin --quiet
git log --oneline -3
git rev-list --left-right --count origin/main...HEAD   # "0  0" senkron demek
git show --stat HEAD
git show HEAD -- <ilgili dosyalar>   # gerçek diff'i satır satır oku
```
