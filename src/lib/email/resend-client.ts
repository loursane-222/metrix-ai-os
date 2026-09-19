// Minimal Resend adapter for transactional email. Only what the OTP login
// flow needs (plain-text send, one error surface) — no template engine, no
// retry/queue layer. Callers inject a `sendEmail` for tests; this module's
// export is the real, network-calling default.

import { Resend } from "resend";

export class EmailDeliveryError extends Error {
  readonly code = "EMAIL_DELIVERY_FAILED";

  constructor(cause?: unknown) {
    super("Failed to send email");
    this.name = "EmailDeliveryError";
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export class MissingEmailConfigError extends Error {
  readonly code = "MISSING_EMAIL_CONFIG";

  constructor(missing: string) {
    super(`${missing} is not configured`);
    this.name = "MissingEmailConfigError";
  }
}

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type EmailSender = (input: SendEmailInput) => Promise<void>;

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new MissingEmailConfigError(name);
  }

  return value;
}

let cachedClient: Resend | null = null;

function getClient(): Resend {
  if (!cachedClient) {
    cachedClient = new Resend(requireEnv("RESEND_API_KEY"));
  }

  return cachedClient;
}

export const sendEmailViaResend: EmailSender = async ({
  to,
  subject,
  text,
  html
}) => {
  const from = requireEnv("EMAIL_FROM");
  const client = getClient();

  let result: Awaited<ReturnType<Resend["emails"]["send"]>>;

  try {
    result = await client.emails.send({ from, to, subject, text, html });
  } catch (error) {
    throw new EmailDeliveryError(error);
  }

  if (result.error) {
    throw new EmailDeliveryError(result.error);
  }
};
