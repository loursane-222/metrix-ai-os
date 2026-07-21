import { Resend } from "resend";
import { OTP_EXPIRES_IN_MINUTES } from "@/lib/auth/shared/auth.constants";

const EMAIL_FROM = process.env.EMAIL_FROM ?? "Metrix <noreply@metrixai.app>";

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set.");
  }

  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: "Metrix giriş kodunuz",
    text: [
      `Giriş kodunuz: ${code}`,
      "",
      `Bu kod ${OTP_EXPIRES_IN_MINUTES} dakika içinde geçerliliğini yitirir.`,
      "Eğer bu işlemi siz başlatmadıysanız bu emaili dikkate almayın.",
    ].join("\n"),
  });

  if (error) {
    throw new Error(`Email gönderilemedi: ${error.message}`);
  }
}
