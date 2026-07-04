import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Kullanım Şartları | Metrix",
  description: "Metrix Kullanım Şartları taslağı.",
};

const sections = [
  {
    title: "Hizmetin kapsamı",
    body: "Metrix AI OS, şirket sahiplerinin operasyon, risk, öncelik ve takip süreçlerini daha düzenli değerlendirmesine yardımcı olan bir karar destek hizmetidir.",
  },
  {
    title: "Kullanıcı sorumluluğu",
    body: "Kullanıcı, hizmete girdiği bilgilerin doğruluğundan, hesabının yetkili kişilerce kullanılmasından ve ticari kararlarının sonuçlarından sorumludur.",
  },
  {
    title: "AI önerilerinin niteliği",
    body: "Metrix tarafından sunulan AI önerileri karar desteğidir; nihai ticari karar, uygulama ve sorumluluk kullanıcıya aittir.",
  },
  {
    title: "Veri güvenliği",
    body: "Hizmet kapsamında işlenen veriler için makul teknik ve idari güvenlik önlemleri uygulanması hedeflenir. Kullanıcı gizli bilgileri paylaşırken gerekli özeni göstermelidir.",
  },
  {
    title: "Hesap güvenliği",
    body: "Telefon doğrulaması, oturum ve cihaz güvenliği kullanıcı hesabını korumak için kullanılır. Kullanıcı, hesabına yetkisiz erişim şüphesinde Metrix ile iletişime geçmelidir.",
  },
  {
    title: "Sorumluluk sınırları",
    body: "Metrix, kullanıcı tarafından alınan ticari kararların doğrudan sonucu olarak ortaya çıkabilecek kayıp, zarar veya fırsat maliyetleri için hukuken izin verilen ölçüde sınırlı sorumluluğa sahiptir.",
  },
  {
    title: "Değişiklikler",
    body: "Kullanım şartları, hizmetin kapsamı ve yürürlükteki mevzuata göre güncellenebilir. Yayın öncesi son metin kullanıcıya açıkça sunulmalıdır.",
  },
  {
    title: "Hukuki onay notu",
    body: "Bu sayfa taslak metindir; yayın öncesi hukuk danışmanı tarafından incelenmeli ve onaylanmalıdır.",
  },
];

export default function TermsPage() {
  return <LegalPage title="Kullanım Şartları" sections={sections} />;
}

function LegalPage({
  sections,
  title,
}: {
  sections: Array<{ title: string; body: string }>;
  title: string;
}) {
  return (
    <main className="min-h-screen bg-[#f6efe3] px-5 py-8 text-[#14213d]">
      <article className="mx-auto max-w-3xl rounded-[28px] border border-white/80 bg-[#fffaf2]/95 p-6 shadow-[0_24px_70px_rgba(74,52,32,0.12)] sm:p-8">
        <Link
          className="text-sm font-bold text-[#6f4a28] underline decoration-[#c8a47b] underline-offset-4"
          href="/"
        >
          Metrix girişine dön
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold tracking-normal">
          {title}
        </h1>
        <p className="mt-3 rounded-2xl border border-[#ead8c0] bg-[#fffdf9] p-4 text-sm font-semibold leading-6 text-[#665f55]">
          Taslak metindir, yayın öncesi hukuk danışmanı tarafından
          onaylanmalıdır.
        </p>
        <div className="mt-8 space-y-6">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-extrabold tracking-normal">
                {section.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#665f55]">
                {section.body}
              </p>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
