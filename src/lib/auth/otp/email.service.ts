import { Resend } from "resend";
import { OTP_EXPIRES_IN_MINUTES } from "@/lib/auth/shared/auth.constants";

const DEFAULT_EMAIL_FROM = "METRIX <noreply@metrixgm.com>";
const DEFAULT_REPLY_TO = "support@metrixgm.com";

export type OtpEmailContent = { subject: string; html: string; text: string };

export function buildOtpEmailContent(code: string): OtpEmailContent {
  const subject = "METRIX doğrulama kodunuz";
  const text = [
    "METRIX — AI Executive OS",
    "",
    "Doğrulama kodu",
    code,
    "",
    `Bu kod ${OTP_EXPIRES_IN_MINUTES} dakika geçerlidir.`,
    "Bu işlemi siz başlatmadıysanız bu e-postayı dikkate almayın. Hesabınızda herhangi bir değişiklik yapılmayacaktır.",
    "",
    `Destek: ${DEFAULT_REPLY_TO}`,
    "",
    "© METRIX AI Executive OS",
  ].join("\n");

  const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<style>
  body{margin:0;background:#061018;color:#eaf2f4;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif} .wrap{padding:32px 16px}.card{max-width:560px;margin:0 auto;background:#0b1821;border:1px solid #20333b;border-radius:24px;overflow:hidden}.head{padding:32px 32px 22px;text-align:center;background:radial-gradient(circle at 50% 0,rgba(52,230,207,.16),transparent 62%)}.brand{font-size:30px;font-weight:900;letter-spacing:.18em;color:#f4f7f8}.tag{margin-top:8px;font-size:11px;font-weight:700;letter-spacing:.22em;color:#34e6cf}.body{padding:8px 32px 32px}.label{text-align:center;font-size:14px;color:#9ba8b2}.code{margin:18px 0 22px;padding:20px 12px;border:1px solid rgba(52,230,207,.28);border-radius:16px;background:#071417;text-align:center;font:800 42px/1.1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.24em;color:#d9fff9}.copy{font-size:14px;line-height:1.65;color:#b8c3c9}.note{margin-top:22px;padding:16px;border-radius:14px;background:#101f28;font-size:13px;line-height:1.6;color:#93a0ad}.footer{padding:20px 32px;border-top:1px solid #20333b;text-align:center;font-size:12px;line-height:1.6;color:#6f7d87}.footer a{color:#34e6cf}@media(max-width:480px){.wrap{padding:12px}.card{border-radius:18px}.head{padding:26px 20px 18px}.body{padding:8px 20px 26px}.code{font-size:34px;letter-spacing:.18em}.footer{padding:18px 20px}}@media(prefers-color-scheme:light){body{background:#eef4f3}.card{background:#fff;border-color:#d9e4e2}.brand{color:#071417}.body{color:#17262d}.code{background:#f1faf8;color:#092d29}.copy{color:#465960}.note{background:#f3f7f7;color:#5f7077}.footer{border-color:#d9e4e2;color:#718087}}
</style></head><body><div class="wrap"><div class="card"><div class="head"><div class="brand">METRIX</div><div class="tag">AI EXECUTIVE OS</div></div><div class="body"><p class="label">Doğrulama kodu</p><div class="code">${escapeHtml(code)}</div><p class="copy">Bu kod <strong>${OTP_EXPIRES_IN_MINUTES} dakika</strong> geçerlidir.</p><div class="note">Bu işlemi siz başlatmadıysanız bu e-postayı dikkate almayın. Hesabınızda herhangi bir değişiklik yapılmayacaktır.</div></div><div class="footer">Yardıma mı ihtiyacınız var? <a href="mailto:${DEFAULT_REPLY_TO}">${DEFAULT_REPLY_TO}</a><br>© METRIX AI Executive OS</div></div></div></body></html>`;

  return { subject, html, text };
}

export async function sendOtpEmail(to: string, code: string): Promise<{ providerMessageId: string | null }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set.");

  const resend = new Resend(apiKey);
  const content = buildOtpEmailContent(code);
  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? DEFAULT_EMAIL_FROM,
    replyTo: process.env.EMAIL_REPLY_TO ?? DEFAULT_REPLY_TO,
    to,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });

  if (error) throw new Error(`Email gönderilemedi: ${error.message}`);
  return { providerMessageId: data?.id ?? null };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}
