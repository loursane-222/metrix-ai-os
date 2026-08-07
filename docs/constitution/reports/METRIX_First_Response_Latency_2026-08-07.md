# METRIX İlk Yanıt Gecikmesi — Ölçüm ve Hedefli Hızlandırma

Tarih: 2026-08-07

Senaryo: “Önümüzdeki hafta nakit akışında hangi riski önce ele almalıyım?”

Tekrar: text 3, voice HTTP+TTS 3; gerçek PostgreSQL ve OpenAI provider

## Ön koşul

`d5bb164`, `a134d28`, `0cda4f2`, `a5d810a`, `b6e9b42` ve `429d93a` commitleri `origin/main` üzerinde doğrulandı.

## Aşama 1 — baz ölçüm

İstemci uçtan uca değerleri ortalama ± popülasyon standart sapmasıdır.

| Kanal | İlk ana metin | İlk ses | Done |
|---|---:|---:|---:|
| Text | 10.177 ± 4.327 ms (6.250–16.204) | — | 15.668 ± 3.852 ms |
| Voice | 5.842 ± 164 ms (5.707–6.073) | 7.265 ± 227 ms | 13.812 ± 1.436 ms |

Güncel mimari Temmuz denetimindeki koddan farklıdır. Eski `buildExecutiveOperatingContext`, 9 alt adımı, altı `executive-*` builder, `buildExecutivePromptBridge` ve `retrieveGmailContext` artık `/api/ai/chat` ilk-token kritik yolunda değildir. Bu nedenle aşağıdaki tabloda “kritik yolda değil” olarak gösterilir; sıfır değeri çağrının hızlı olduğu değil, bu üretim yolunda çalışmadığı anlamına gelir.

| Kritik yol adımı | Text baz | Voice baz | Bulgular |
|---|---:|---:|---|
| Auth + rate limit | 10–147 ms | aynı yol | İlk derleme turunda 136+11 ms; sıcak turlarda DB düzeyinde düşük onlarca ms |
| Readiness/runtime profile | <1 ms | <1 ms | CPU-only |
| Conversation resolve + memory | 5–15 ms | 5–15 ms | `Promise.all` ile paralel |
| Gap detection | <1 ms | <1 ms | CPU-only |
| `classifyConversation` | 4.7–13.5 sn | 4.7 sn ölçülen örnek | Asıl P0; 1.929 input + 276 output token örneği 13.529 ms sürdü |
| Canonical Management Picture | 35–69 ms | 35–69 ms | Eski 9-adımlı operating-context yerine kullanılan güncel boundary |
| Eski operating-context 9 alt adımı | kritik yolda değil | kritik yolda değil | Legacy projection |
| Eski 6 builder zinciri | kritik yolda değil | kritik yolda değil | Yeni council/profile/package/brief 0–2 ms/adım ve ilk chunk sonrasında |
| `buildExecutivePromptBridge` | kritik yolda değil | kritik yolda değil | Güncel canonical prompt serializer kullanılıyor |
| `retrieveGmailContext` | çağrılmadı | çağrılmadı | Test mesajı explicit Gmail isteği değil; TTFT’yi bloke etmiyor |
| `renderPromptTemplate` | 0–1 ms | 0–1 ms | CPU-only |
| Ana OpenAI ilk delta | ≈0.9–1.0 sn | ≈0.9–1.0 sn | Bizim kontrolümüz dışındaki provider/network alt sınırı |
| TTS ilk byte | — | ≈1.0–1.3 sn | Ana metinden sonra başlayan `gpt-4o-mini-tts` provider süresi |

Realtime session endpoint’i native içerik üretimini kapalı tutar; bu testte voice response authority HTTP METRIX pipeline + TTS idi. Fiziksel mikrofonlu WebRTC/SDP ve akustik STT/VAD turu otomasyonda çalıştırılmadığı için bu üç kaleme uydurma ms yazılmadı. İstemci ve session endpoint’inde mevcut timeline işaretleri korunuyor.

## Aşama 2 — aynı turda dinamik açılış

`/api/ai/chat` artık auth ve conversation resolve sonrasında response’u açar. Canonical METRIX kimliğiyle üretilen konuya özel açılış ile canonical classification/context/ana cevap aynı anda başlar. Açılış `phase: opening`, ana cevap `phase: primary`, derin muhakeme `phase: enrichment` olarak aynı NDJSON turunda ve aynı `metrix_main_model` authority ile akar. Açılış başarısız olursa canonical cevap kesilmez.

İlk ara uygulama ölçümü:

| Kanal | Açılış ilk metin | İlk ses |
|---|---:|---:|
| Text | 1.112 ± 251 ms | — |
| Voice | 1.334 ± 435 ms | 2.278 ± 422 ms |

Beş gerçek transkript:

1. “Önümüzdeki hafta nakit akışındaki kritik risk kalemlerini detaylı analiz ediyorum.”
2. “Atlas müşterisinin ödeme kayıtları ve tahsilat geçmişi üzerinden kapsamlı bir durum analizi yapalım.”
3. “Satış performansının mevcut durumu ve hedeflerle karşılaştırılması için verilerin detaylı analizi gerekiyor.”
4. “Ekibin bu haftaki önceliklerinin mevcut durum ve hedeflerle uyumunu detaylıca analiz edelim.”
5. “Açık tekliflerin kritik başarı faktörlerini ve müşteri geri dönüş dinamiklerini analiz edelim.”

200–500 ms hedefi karşılanmadı. En hızlı gerçek açılış 800–900 ms bandında; aynı canonical kimlik prompt’una sahip en küçük streaming OpenAI çağrısının provider/network TTFT’si tek başına hedefi aşıyor. Voice’ta buna TTS’in yaklaşık 1 saniyelik ilk-byte süresi ekleniyor. Canned metin veya farklı kimlik/model kullanılmadan ölçülen fiziksel alt sınır budur.

## Aşama 3 — ölçüme dayalı hızlandırma

`executive_analysis` readiness kararı verilmiş turlarda aynı routing kararını ikinci kez üretmek için LLM classifier çağrısı kaldırıldı. Bu dar profil canonical deterministic understanding kullanır. Navigation/action ve diğer profiller mevcut classifier’a gitmeye devam eder.

| Kanal/metrik | Önce | Sonra | Değişim |
|---|---:|---:|---:|
| Text ilk görünür söz | 10.177 ms | 1.112 ms | -89% |
| Text gerçek cevap başlangıcı | 10.177 ms | 2.268 ms | -78% |
| Voice ilk görünür söz | 5.842 ms | 1.334 ms | -77% |
| Voice gerçek cevap başlangıcı | 5.842 ms | 1.760 ms | -70% |
| Voice ilk ses | 7.265 ms | 2.278 ms | -69% |
| Text done | 15.668 ms | 10.735 ms | -31% (provider enrichment outlier: 17.552 ms) |
| Voice done | 13.812 ms | 11.884 ms | -14% (provider enrichment outlier: 17.980 ms) |

Tamamlanma süresindeki kalan uzun kuyruk, ilk sözden sonra çalışan executive-context enrichment ve iki streaming OpenAI cevabının provider varyansıdır. İlk söz/ilk gerçek cevap artık bu işi beklemez.

## Doğrulama

- `npx tsc --noEmit`
- 11 ilgili Vitest dosyası, 120 test: başarılı
- Text/voice gerçek provider E2E: 3’er tur (bir voice assertion ms yuvarlamasında eşitlik nedeniyle düzeltildi; tekrar başarılı)
- 5 farklı mesaj açılış E2E: başarılı
