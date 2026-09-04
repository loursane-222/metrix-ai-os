import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | Metrix",
  description: "Metrix AI OS Terms of Service — scope of the service, user responsibilities, third-party integrations, and limits of liability.",
};

const sections: Array<{ title: string; body: string[] }> = [
  {
    title: "1. Service scope",
    body: [
      "Metrix AI OS (\"Metrix\", \"the Service\") is a decision-support product that helps business owners and their teams organize, review, and act on their company's operational and financial data, including customer, order, quote, invoice, payment, task, and calendar records.",
      "Metrix's AI-generated suggestions, summaries, and recommendations are decision support only. Metrix does not make final business, financial, or legal decisions on your behalf — you and your organization remain responsible for evaluating and acting on them.",
    ],
  },
  {
    title: "2. User responsibilities",
    body: [
      "You are responsible for the accuracy of the information you or your team enter into Metrix, for restricting account access to authorized personnel, and for the business outcomes of decisions made using the Service.",
      "You must have the right to enter any customer, supplier, or third-party data you input into Metrix, and to grant Metrix access to any third-party account (such as Google) you choose to connect.",
    ],
  },
  {
    title: "3. Third-party integrations",
    body: [
      "Metrix supports optional connections to third-party services, including Google (Gmail and, where available, Google Calendar). These connections are established only with your explicit authorization through the provider's own consent flow (e.g., Google OAuth) and access only the scope you grant.",
      "Your use of any connected third-party service also remains subject to that provider's own terms of service and privacy policy. Metrix is not responsible for the availability, accuracy, or content of third-party services.",
      "See our Privacy Policy for how data obtained through a connected Google account is used.",
    ],
  },
  {
    title: "4. Service availability",
    body: [
      "We aim to keep the Service reliably available but do not guarantee uninterrupted or error-free operation. Planned or unplanned downtime, including downtime caused by a connected third-party provider, may occur.",
    ],
  },
  {
    title: "5. Prohibited use",
    body: [
      "You may not use Metrix to store or process data you are not authorized to hold, to attempt to gain unauthorized access to the Service or another organization's data, to reverse engineer or disrupt the Service, or to use the Service for any unlawful purpose.",
    ],
  },
  {
    title: "6. Account and access",
    body: [
      "Access to Metrix is authenticated per user and scoped to your organization's workspace. You must notify us promptly if you suspect unauthorized access to your account. We may suspend access that we reasonably believe poses a security risk to the Service or other organizations.",
    ],
  },
  {
    title: "7. Limitation of liability",
    body: [
      "To the extent permitted by applicable law, Metrix's liability for any claim arising from your use of the Service is limited to direct damages, and Metrix is not liable for indirect, incidental, or consequential losses — including lost profit or business opportunity — resulting from business decisions made using the Service.",
    ],
  },
  {
    title: "8. Changes to these terms",
    body: [
      "We may update these Terms as the Service evolves. Material changes will be reflected on this page with an updated effective date; continued use of the Service after such changes constitutes acceptance of the updated Terms.",
    ],
  },
  {
    title: "9. Contact",
    body: [
      "For questions about these Terms, contact us at destek@metrixgm.com.",
    ],
  },
];

export default function TermsPage() {
  return <LegalPage title="Terms of Service" intro="These Terms govern your use of Metrix AI OS, including any optional third-party connections (such as Google) you choose to enable." sections={sections} />;
}

function LegalPage({ title, intro, sections }: { title: string; intro: string; sections: Array<{ title: string; body: string[] }> }) {
  return (
    <main className="min-h-screen bg-[#f6efe3] px-5 py-8 text-[#14213d]">
      <article className="mx-auto max-w-3xl rounded-[28px] border border-white/80 bg-[#fffaf2]/95 p-6 shadow-[0_24px_70px_rgba(74,52,32,0.12)] sm:p-8">
        <Link className="text-sm font-bold text-[#6f4a28] underline decoration-[#c8a47b] underline-offset-4" href="/">
          Back to Metrix
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold tracking-normal">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#665f55]">{intro}</p>
        <div className="mt-8 space-y-6">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-extrabold tracking-normal">{section.title}</h2>
              <div className="mt-2 space-y-2">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-6 text-[#665f55]">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
