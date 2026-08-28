# GÖREV METNİ — METRIX Beyin/Karakter Stabilite Denetimi

**Kime:** Codex
**Fazın türü:** DENETİM (bu turda kapsamlı düzeltme değil — bulguları raporla, en küçük/en güvenli olanları düzeltebilirsin ama büyük bir fix'i bu görev metnindeki bulgudan sonra ayrı bir onaylı faz olarak bekleteceğiz). `METRIX_TASK_BRIEF_veri-temizligi-ve-konusma-hatalari.md` ile paralel/bağımsız yürütülebilir; o görev zaten bulunan 4 somut soruna odaklı, bu görev daha genişinin haritasını çıkarıyor.

**Neden:** Murat'ın sorusu birebir: "metrix beyni-karakteri neden stabil çalışamıyor? baştan sona incele. tespit ettiğin sorunları çözdüğümüzde bir daha yaşanmamak üzere tüm problemler bitmiş olsun." Şu ana kadar üç kez, üç farklı yerde gerçek, birbirinden bağımsız kalite sorunu bulundu (bkz. Bölüm 0) — bu, izole vakalar değil, sistemik bir desenin işareti olabilir. `src/lib` altında 46 ayrı `executive-*` klasörü ve ~280 dosya var; bu ölçekte "her şeyi oku" gerçekçi değil, bu yüzden denetim aşağıdaki dört **kanıtlanmış hata sınıfına** göre hedefli yapılacak.

**Dürüstlük notu (Murat'a da böyle söylendi):** Bu ölçekteki bir sistemde "bir daha asla olmasın" garantisi tek bir denetim turuyla verilemez. Yapılabilecek olan: kök nedenleri (semptomları değil) düzeltmek, ve her hata sınıfı için **kalıcı bir otomatik koruma** (test/lint/runtime guard) eklemek — böylece aynı sınıf hata bir daha sessizce geri gelemez, gelirse otomatik yakalanır.

---

## 0. Şimdiye Kadar Kanıtlanmış Hata Sınıfları (bu denetimin çıkış noktası)

1. **Sessiz fallback → yanlış/tutarsız cevap:** "kim bu müşteriler" sorusuna doğru isim listesi verildi, hemen ardından "tamam ver" sorusuna ham veritabanı ID'leri + kendiyle çelişen "hafızamda yok" cevabı geldi. Bu proje bunu daha önce de yaşamış: `METRIX_OPERATION_HANDOFF.md` §16 "Planner failure → silent fallback → false success" diye kayıtlı, bir kez ACCEPTED edilmiş — ama görünen o ki desen başka bir yerde tekrar etti.
2. **Birbirine bağlanmamış iki sistem:** `canonical-business-facts.service.ts` (doğru sayı/liste üretir) ile `living-workspace` (görsel yüzeyi açar) hiç konuşmuyor — doğru cevap üretiliyor ama görselleştirilmiyor.
3. **Hard-coded metinlerde kalite sorunu:** En az 4 dosyada (`executive-focus-engine`, `executive-decision-engine` x2, `executive-delegation-engine`) Türkçe karakterler eksik yazılmış.
4. **Test verisi production'a sızmış:** Gerçek hesapta gerçek müşteri tablosunda en az 5-7 test kaydı var, aylardır temizlenmemiş.

## 1. Denetim Alanı A — Sessiz Fallback / Tutarsızlık Taraması

**Hedef:** "Bir turda doğru, sonraki turda yanlış/çelişkili" türünden başka örnekler var mı?

- `src/app/api/ai/chat/route.ts` ve bağladığı tüm executive-brain/context-builder katmanlarında, `catch`, `.catch(() => ...)`, `try { } catch { return fallback }`, `?? "varsayılan"` gibi sessizce yutulan hata/fallback noktalarını tara. Her biri için sor: bu fallback, kullanıcıya "bilmiyorum" gibi dürüst mü davranıyor, yoksa yanlış/eski/kısmi bir veriyi kesin doğruymuş gibi mi sunuyor?
- Özellikle çok-turlu (multi-turn) konuşma bağlamının nasıl taşındığını incele: bir turda üretilen veri (örn. müşteri listesi) bir sonraki turda hâlâ erişilebilir mi, yoksa context penceresi/özet mekanizması onu kaybediyor mu? "tamam ver" bug'ının kök nedenini bulman zaten `veri-temizligi-ve-konusma-hatalari.md` görevinde isteniyor — burada onun **genel sınıfını** ara: aynı desenin tetiklendiği başka komut/soru kalıpları var mı (örn. "detaylandır", "biraz daha anlat", "hangi ürünler" gibi belirsiz takip soruları)?
- **Koruma öner:** Bu sınıf hata için nasıl bir otomatik test/guard eklenebilir? (örn. "önceki turda listelenen entity ID'leri sonraki turda hâlâ çözülebiliyor mu" diye kontrol eden bir entegrasyon testi).

## 2. Denetim Alanı B — Bağlanmamış Sistemler Haritası

**Hedef:** canonical-facts↔workspace gibi başka "doğru üretiyor ama göstermiyor/kullanmıyor" çiftleri var mı?

- `executive-*` klasörlerinin çıktısını (örn. `executive-decision-engine`, `executive-forecasting`, `executive-goal-intelligence`, `executive-scorecard`) hangi UI bileşenlerinin gerçekten tükettiğini haritalayın. Üretilen ama hiçbir yerde render edilmeyen ("orphan") bir servis var mı?
- `executive-daily-briefing-v2` ile gerçekte ekranda görünen `DailyBriefingCard` arasındaki veri akışını doğrula — Murat'ın gördüğü garip/test-verisi-karışmış brifing kartı, muhtemelen buradaki bir bağlantı sorunuyla da ilişkili olabilir, kontrol et.
- **Koruma öner:** Kullanılmayan/orphan servisleri ya UI'a bağla ya da (gerçekten gereksizse) kaldırılacak aday olarak işaretle — ama bu turda silme, yalnız raporla.

## 3. Denetim Alanı C — Hard-coded Metin Kalitesi, Tam Tarama

`veri-temizligi-ve-konusma-hatalari.md`'de 4 dosya zaten bulundu ve düzeltiliyor. Burada **tüm** `src/lib/executive-*` ve `src/app/api/ai/chat/route.ts` genelinde sistemli bir tarama yap: Türkçe karakter eksikliği (ı/ş/ğ/ç/ö/ü/İ), kalan İngilizce hard-coded string, ya da yarım kalmış placeholder metin ("TODO", "test", "lorem" gibi) var mı? Bulduklarını listele; küçük/güvenli olanları düzelt, büyük hacimliyse ayrı bir takip fazına bırak.

## 4. Denetim Alanı D — Test Verisi Hijyeni (kalıcı kural)

`veri-temizligi-ve-konusma-hatalari.md` mevcut kirliliği temizliyor. Burada ek olarak: bundan sonra hangi mekanizma test kaydı üretimini production'dan ayıracak? Seçenekleri değerlendir (örn. test kayıtlarını belirli bir isim/etiket deseniyle işaretleyip günlük bir temizlik job'ı, ya da ayrı bir test organizasyonu kullanmak) ve bir öneri yaz — karar Murat'a ait, sen yalnız seçenekleri ve önerini sun.

## 5. Rapor Formatı

Her denetim alanı (A-D) için: bulunanların listesi (dosya:satır) + önerilen koruma mekanizması + (varsa) bu turda yapılan küçük/güvenli düzeltmeler. Sonda: hangi bulguların ayrı bir implementasyon fazı gerektirdiğinin net listesi — Murat'ın onayıyla sıradaki faz o listeden şekillenecek.
