# GÖREV METNİ — Beyin Stabilite Fazının Kapanışı (Eksiksiz + Canlıda Kanıtlı)

**Kime:** Codex
**Fazın türü:** Aynı fazın kapanışı — `METRIX_TASK_BRIEF_beyin-stabilite-implementasyon.md`'nin devamı. Yeni kapsam yok, o görevde açık bırakılan her şey + `METRIX_TASK_BRIEF_veri-temizligi-ve-konusma-hatalari.md`'den hâlâ yapılmamış iki madde.

**Murat'ın direktifi (birebir):** "eksik bırakmadan ilerleyelim tüm sorunlar bu fazda çözülmüş olsun ve lütfen canlıda da test edip kanıtla." Bu turda "kısmen tamamlandı" ya da "sonraki faza bırakıldı" kabul edilmeyecek — aşağıdaki her madde ya bitecek ya da neden bitmediği çok somut, teknik bir engelle (ör. "X olmadan Y mümkün değil") açıklanacak; "zaman kalmadı" yeterli gerekçe değil.

---

## 1. Bağımsız kontrolümde bulunan iki gerçek eksik (rapor bunlardan hiç bahsetmedi)

Önceki rapor "tamamlandı" dediği maddelerin dışında, kod taramasında şunları buldum — hiçbiri yapılmamış:

- **Test verisi hâlâ arşivlenmedi.** Önceki implementasyon yalnız *gelecekteki* kirliliği önleyen guard'ı kurdu (`acceptance-mutation-guard.ts`) — ama Murat'ın gördüğü, hâlâ orada duran mevcut test kayıtları (Kabul Testi Firma Bir/İki, Runtime Consistency Kabul Testi, Stale Surface Kabul C, Atlas 9d8fbf4, Kanit Zinciri Bir Ticaret) hiç arşivlenmedi — `git log`'da buna dair hiçbir commit yok. **Bu, en yüksek öncelik.** `METRIX_TASK_BRIEF_veri-temizligi-ve-konusma-hatalari.md` Bölüm 1'deki talimatı birebir uygula: `customer.archive` action'ıyla arşivle, Task/Quote/Invoice/Payment'ta da aynı taramayı yap.
- **Canonical facts hâlâ workspace açmıyor.** `src/app/api/ai/chat/route.ts`'de `createCustomerWorkspaceDirective` veya `livingWorkspaceRuntime.publish` çağrısı yok — yani "kim bu müşteriler" gibi bir soru bugün sorulsa hâlâ yalnız düz metin dönecek, workspace açılmayacak. `METRIX_TASK_BRIEF_veri-temizligi-ve-konusma-hatalari.md` Bölüm 3'ü uygula: canonical facts bir liste/detay içeriyorsa, aynı turda ilgili domain'in workspace directive'i de yayınlansın.

## 2. Türkçe metin — GERÇEKTEN tam tarama, yalnız 6 dosya değil

Guard şu an yalnız 6 dosyayı tarıyor (`scripts/check-user-facing-text.mjs`). Denetimin bulduğu ama düzeltilmeyen dosyalar: `executive-decision-follow-up-engine.service.ts`, `executive-reporting-engine.service.ts` (en çok ihlal burada), `executive-constitution/*.ts`. Bunların da düzeltilmesi yetmez — kapsamı sadece bu üçle sınırlama:

**Yapılacak:** Tüm `src/lib/executive-*` altındaki (46 klasör) kullanıcıya giden hard-coded string'leri tara (yaklaşımı sana bırakıyorum — script'i genişlet ya da ayrı bir tarama scripti yaz, ama gerçekten tüm klasörleri kapsasın). Bulduğun her gerçek ihlali düzelt. Sonra `check-user-facing-text.mjs`'deki `files` listesini bulduğun ve düzelttiğin dosyaların TAMAMINI kapsayacak şekilde genişlet — guard artık yalnız 6 değil, gerçekten kullanıcıya metin üreten tüm dosyaları korumalı. Test fixture'larındaki tekrarları da düzelt (üretim kodu önce, testler ona göre).

## 3. Daily Briefing tam özet gösterimi + orphan servis sözleşmesi

Önceki görevin Bölüm 5'i hiç yapılmadı. Bu turda bitir: `forecastSummary`, `scorecardSummary`, `awarenessSummary`, `executiveNarrativeSummary`, `executiveFocusSummary`, `signalTrendSummary` — üretilen ama `DailyBriefingCard`'da hiç gösterilmeyen bu alanları, tek workspace/rapor şablonu ilkesine uygun şekilde (sıkışık göstermeden, gerekirse genişletilebilir/katlanır bir bölüm olarak) karta ekle. `executive-focus`, `executive-scorecard`, `executive-forecasting`, `executive-delegation` servisleri için: her biri ya gerçek bir UI tüketicisine bağlanacak ya da "kasıtlı olarak yalnız arka plan sinyali" diye açık bir sözleşme/test ile işaretlenecek — belirsiz bırakma.

## 4. Canlıda Kanıtla — bu kez gerçekten

Önceki iki turda da bu adım "yapılamadı" ile bitti (Chrome otomasyonu / erişim sorunu). Bu kez bu engeli aş ya da net, somut biçimde neyin engellediğini söyle:

1. Deploy'un READY olduğunu ve doğru commit SHA'dan geldiğini Vercel dashboard/API'den doğrula.
2. `metrixgm.com`'da gerçek hesapla gir, gerçek sohbette şu sırayı dene: "kaç müşterimiz var?" → "kim bu müşteriler?" → "tamam ver". Üç cevabı da metin olarak raporuna yapıştır.
3. Bu üç adımda: (a) artık test kayıtlarının listede görünmediğini, (b) "kim bu müşteriler" sorusunda workspace'in gerçekten açıldığını, (c) "tamam ver"in artık ham ID göstermediğini ve kendiyle çelişmediğini kanıtla.
4. Kanıtlayamıyorsan, hangi adımda tam olarak neyin seni durdurduğunu (hata mesajı, erişim sorunu, ne olursa) birebir yapıştır — "yapılamadı" tek başına kabul edilmeyecek.

## 5. Rapor Formatı

Her madde (1-4) için: değişiklik kanıtı (dosya:satır) + local doğrulama + commit + push (git-tetiklemeli deploy) + Madde 4'teki canlı kanıt. Hiçbir madde "sonraki faza bırakıldı" ile kapanmasın — kapanmıyorsa nedenini somut teknik gerekçeyle açıkla.
