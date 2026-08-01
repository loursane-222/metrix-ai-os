// Canonical outbound transactional email authority. The only file that
// constructs a Resend client — every domain that needs to send a real email
// (OTP delivery, Offer dispatch, ...) calls sendTransactionalEmail() instead
// of instantiating its own provider. Reuses the same approved provider
// account and verified sending domain (metrixgm.com) already used for OTP.

import { Resend } from "resend";

const DEFAULT_EMAIL_FROM = "METRIX <noreply@metrixgm.com>";
const DEFAULT_REPLY_TO = "support@metrixgm.com";

export type SendTransactionalEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

export type SendTransactionalEmailResult = { providerMessageId: string | null };

export async function sendTransactionalEmail(input: SendTransactionalEmailInput): Promise<SendTransactionalEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set.");

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? DEFAULT_EMAIL_FROM,
    replyTo: input.replyTo ?? process.env.EMAIL_REPLY_TO ?? DEFAULT_REPLY_TO,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  if (error) throw new Error(`Email gönderilemedi: ${error.message}`);
  return { providerMessageId: data?.id ?? null };
}
