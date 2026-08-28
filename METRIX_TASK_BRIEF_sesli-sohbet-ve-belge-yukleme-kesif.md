# Görev Metni: Gerçek Zamanlı Sesli Sohbet + Belge/Görsel Yükleme — Mevcut Durum Keşfi

**⚠️ YERİNE GEÇEN BELGE VAR:** Bu görev metni `METRIX_TASK_BRIEF_metrix-uctan-uca-denetim.md` (repo kökü) Stage A içine taşındı — Codex'e artık bu dosyayı değil, o belgeyi ver. Bu dosya yalnızca tarihsel referans olarak tutuluyor.

**Durum:** Keşif turu. Kod değişikliği yok. `docs/constitution/source/metrix-buyuk-resim-vizyon-v1.md` §2.1-2.2'de kilitlenen iki hedefe (gerçek zamanlı sesli sohbet, öncelikli görsel/dosya senaryoları) nereden başlanacağını netleştirmek için.

**Neden bu tur önce gerekiyor:** Cowork (bu görev metnini yazan taraf) kodda, Murat'ın bilmediği/hatırlamadığı, hedefle doğrudan ilişkili **var olan altyapı** buldu. Bunları görmeden yeni bir inşa görevi yazmak, bu projenin defalarca yaşadığı "zaten var olanın farkında olmadan yeniden/paralel inşa etme" hatasına yol açar.

---

## Madde 1 — Gerçek zamanlı ("native realtime") sesli sohbet zaten kısmen inşa edilmiş ama kasıtlı olarak kapalı

**Bulgu (kod okunarak):**

- `src/lib/voice/voice-native-realtime-flag.ts` içinde `isVoiceNativeRealtimeEnabled()` fonksiyonu **koşulsuz `false` döndürüyor**. Yorum satırı açık: *"Realtime is transport/transcription only. It is never allowed to become a response producer; /api/ai/chat owns every written and spoken METRIX turn."*
- Buna rağmen native realtime için gerçek altyapı kod tabanında var: `src/lib/onboarding/voice/realtime-session.types.ts`, `voice-discovery-controller.ts`, ses seçimi (`resolveNativeRealtimeVoiceFromEnv`, `CHAT_VOICE_REALTIME_VOICE` env değişkeni), `src/app/api/ai/chat/voice/session/route.ts` + `voice/tts/route.ts`.
- Bugün canlıda çalışan sesli sohbet, **HTTP tur-tabanlı** bir akış: kullanıcı konuşur → transcript `/api/ai/chat`'e gönderilir → METRIX yazılı cevap üretir → TTS ile seslendirilir (`useVoiceChatConnection.ts`, `useVoiceTtsQueue.ts`, `voice/rhythmEngine.ts`, `voice/turnOwnership.ts`, `voice/speechPlanner.ts` — barge-in/VAD/turn ownership gibi gerçek mekanizmalar var, ama temelde her tur ayrı bir HTTP çağrısı).
- Kod yorumlarında "Faz 1A.1 Stabilization", "Faz 1A.2 — Voice Identity" gibi ibareler var — bunlar `executive-cognitive-stack-v1.md`'nin Faz 1-9 numaralandırmasından **farklı, ayrı bir sesli-sohbet-özel faz numaralandırması**. Karıştırılmamalı.

**Gerilim (Murat'a açıkça anlatılmalı):** Gerçek "native realtime" (örn. OpenAI Realtime API üzerinden düşük gecikmeli, tam-duplex konuşma — `package.json`'da `openai: ^6.42.0` zaten var) etkinleştirilirse, cevabı üreten şey artık kanonik `/api/ai/chat` muhakeme hattı değil, doğrudan realtime model olabilir — bu da METRIX'in cevaplarının her zaman gerçek şirket verisine/karar mantığına dayanmasını garanti eden mevcut ilkeyle (yorumda açıkça yazılı: "asla cevap üretici olamaz") çelişir. Yani Gemini Live tarzı doğal akışı elde etmek ile "her cevap kanonik muhakemeden geçsin" ilkesini korumak arasında gerçek bir mimari gerilim var — bu satır kasıtlı olarak `false` bırakılmış, muhtemelen bu gerilim çözülemediği için.

**İstenen:**
1. Bu `false` kararının ne zaman, hangi commit'te, hangi gerekçeyle verildiğini `git log -p -- src/lib/voice/voice-native-realtime-flag.ts` ile bul, gerekçeyi özetle.
2. Native realtime'ı açmanın önündeki gerçek engel neydi — yalnızca "henüz test edilmedi" mi, yoksa yukarıdaki mimari gerilim gerçekten çözülememiş mi? Kod/yorum/varsa ilgili test dosyalarından kanıt bul.
3. En az iki somut yol öner (gerekçeleriyle, kod yazmadan):
   - **A)** Realtime modeli yalnızca ses/prozodi/kesinti yönetimi için kullan (transport), içerik kararını yine `/api/ai/chat`'e devret — teknik olarak mümkün mü, gecikme maliyeti ne olur?
   - **B)** Realtime modelin doğrudan cevap ürettiği bir mod aç ama yalnızca kanonik veriye dayanan, önceden onaylı bir bilgi kümesiyle sınırla (örn. sadece zaten yüklenmiş konuşma bağlamı + Mind State — spekülatif/hesaplanmamış cevap yasak).
   - Senin önerin varsa ekle.

## Madde 2 — Belge/görsel yükleyip müşteri oluşturma zaten büyük ölçüde inşa edilmiş olabilir

**Bulgu (kod okunarak):**

- `src/lib/customers/customer-document-attachment.service.ts` — konuşmaya bağlı, 10MB'a kadar (jpeg/png/webp/pdf) dosya yükleme, 30 dakika TTL'li geçici saklama.
- `customer-ingestion-preview-runtime.ts`, `customer-create-surface-runtime.ts`, `customer-create-surface-command-channel.ts`, `field-authority/customer-document-extraction-route-service.ts`, `customer-document-duplicate-update-service.ts`, `customer-document-commit-service.ts`, `customer-attachment-conversation-coordinator.ts` — isimlerden ve `customer-document-attachment.service.ts` içindeki alanlardan (`extractionStatus`, `extractionPayload`, `reviewStatus`, `draftId`, `commitResult`, `committedCustomerId`) anlaşılan: yükle → çıkarım yap → kullanıcıya önizlet/onaylat → yeni müşteri kaydı olarak commit et akışı **muhtemelen zaten var**.
- API rotaları da var: `src/app/api/customers/document-attachments/route.ts`, `document-extractions/[attachmentRef]/duplicate-update/route.ts`, `.../candidates-applied/route.ts`.

**İstenen:**
1. Bu akışın gerçekten uçtan uca çalışıp çalışmadığını doğrula — test dosyalarına bak, mümkünse yerel/seed ortamda gerçek bir görsel (örn. örnek bir vergi levhası/fatura benzeri belge) yükleyip yeni müşteri oluşturana kadar dene.
2. Eğer çalışıyorsa: neden Murat bunun var olduğunu bilmiyor/hatırlamıyor — sohbet arayüzünde keşfedilebilir mi (örn. "dosya yükle" düğmesi görünür mü, yoksa yalnızca API seviyesinde mi var)? UI tarafı eksikse onu belirt.
3. Eğer çalışmıyorsa veya yarım kalmışsa: tam olarak nerede kesildiğini bul (ekran görüntüsü ile kanıtla, `qa-screenshots/` protokolüne uy).
4. "Bitmiş iş fotoğrafı → yöneticiye bildirim" akışı için: `src/lib/notifications` içinde "yönetici"/"supervisor" kavramı arandı, **sıfır sonuç** çıktı — bu akış muhtemelen hiç yok. Organizasyonda rol/hiyerarşi (kim kimin yöneticisi) kavramı var mı diye Prisma şemasını kontrol et, varsa/yoksa raporla. Bu madde için kod yazma, yalnızca zemin bilgisini topla.

---

## Kısıtlar

- Kod değişikliği yok (yalnızca yukarıda Madde 2.1'de istenen tek uçtan uca deneme testi hariç — o da yerel/seed ortamda, production'a dokunmadan).
- Varsayımla ilerleme — "muhtemelen çalışıyordur" diyip geçme, gerçekten dene/doğrula.

## Rapor beklentisi

İki madde için ayrı: (1) native realtime'ın kapalı kalma gerekçesi + iki seçenek + öneri, (2) belge→müşteri akışının gerçek çalışma durumu (kanıtla) + iş-fotoğrafı→bildirim için zemin bilgisi. Bu rapor geldikten sonra Murat'la birlikte, hangi somut inşa görevinin hangi sırayla yazılacağına karar verilecek.
