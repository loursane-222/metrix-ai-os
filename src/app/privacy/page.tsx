import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Metrix",
  description: "Metrix AI OS Privacy Policy — what data is processed, how Google account data (Gmail, Google Calendar) is used, and how access can be revoked.",
};

const sections: Array<{ title: string; body: string[] }> = [
  {
    title: "1. Scope",
    body: [
      "This Privacy Policy describes how Metrix AI OS (\"Metrix\", \"the Service\") processes information when a business and its authorized users use Metrix to operate, review, and act on their company's business data, including information obtained through optional third-party connections such as Google (Gmail, Google Calendar).",
    ],
  },
  {
    title: "2. Data categories we process",
    body: [
      "Account and organization data: name, phone number, email, organization/company profile, role, and session/authentication data.",
      "Business data you or your team enter into Metrix: customers, orders, quotes, invoices, payments, calendar events, tasks, and related operational records created inside the product.",
      "Usage and diagnostic data: request logs, error logs, and activity records used to operate and secure the Service.",
      "Google account data (only if you connect a Google account): Gmail message metadata and content (sender, recipient, subject, timestamp, and message body) for messages retrieved within the scope you authorize, and — where you separately connect Google Calendar — calendar event details (title, time, attendees, description) for events within the scope you authorize.",
    ],
  },
  {
    title: "3. Google user data — scope-limited use",
    body: [
      "Access to Gmail and Google Calendar data is optional, requires your explicit Google OAuth consent, and is limited strictly to the scope you grant during that consent flow.",
      "Metrix's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.",
      "Google account data is used only to power the Metrix product functions you request — for example, surfacing a relevant email or calendar event when you ask about a specific customer — and is never used for advertising, and is never sold or transferred to third parties for their own independent purposes.",
      "Metrix does not use Gmail or Google Calendar data to train generalized, non-personalized AI/ML models.",
    ],
  },
  {
    title: "4. Purpose of processing",
    body: [
      "We process the data above to authenticate you, operate your organization's workspace, provide the specific product functions you use (including retrieving relevant Gmail or Google Calendar information when you explicitly ask for it), maintain security, and meet legal obligations. We do not process Google account data for any purpose outside these product functions.",
    ],
  },
  {
    title: "5. Revoking access",
    body: [
      "You can disconnect a connected Google account from within Metrix at any time, which stops further access and removes the stored connection.",
      "You can independently revoke Metrix's access at any time from your Google Account's third-party access settings (myaccount.google.com/permissions), regardless of any action taken inside Metrix.",
    ],
  },
  {
    title: "6. Security, retention, and deletion",
    body: [
      "Access to stored data is restricted by organization and user-level authorization. Stored credentials for connected Google accounts (access and refresh tokens) are encrypted at rest.",
      "Business data and connected-account data are retained for as long as your organization's account is active and as needed to provide the Service. When a Google connection is disconnected, or upon a verified deletion request, associated stored tokens and cached Google-sourced content are deleted from our systems.",
      "You may request access to, correction of, or deletion of your personal data using the contact information below.",
    ],
  },
  {
    title: "7. Sharing with third parties",
    body: [
      "We do not sell personal data or Google user data. We do not share Google user data with third parties except as required to operate the Service (e.g., infrastructure/hosting providers acting on our behalf under confidentiality obligations) or where required by law.",
    ],
  },
  {
    title: "8. Changes to this policy",
    body: [
      "We may update this Privacy Policy as the Service evolves. Material changes will be reflected on this page with an updated effective date.",
    ],
  },
  {
    title: "9. Contact",
    body: [
      "For questions about this Privacy Policy or to make a data access, correction, or deletion request, contact us at destek@metrixgm.com.",
    ],
  },
];

export default function PrivacyPage() {
  return <LegalPage title="Privacy Policy" intro="Effective for all current Metrix AI OS users, including those who connect a Google account (Gmail and/or Google Calendar)." sections={sections} />;
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
