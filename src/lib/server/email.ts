/**
 * إرسال البريد الإلكتروني (لاستعادة الرمز السرّي فقط). المزوّد يُختار بـ EMAIL_PROVIDER:
 *  - brevo   : BREVO_API_KEY + EMAIL_FROM (بريد مُوثَّق في Brevo، يكفي Gmail) — 300 رسالة/يوم مجّاناً
 *  - resend  : RESEND_API_KEY + EMAIL_FROM (يحتاج نطاقاً مُوثَّقاً)
 *  - console : يطبع الرسالة في سجلّ الخادم (للتطوير)
 * بلا إعداد: console في التطوير المحلّي فقط، ومعطّل في الإنتاج.
 */
export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}
export interface Mailer {
  send(m: Mail): Promise<void>;
}

export const sentMail: Mail[] = [];

const consoleMailer: Mailer = {
  async send(m) {
    sentMail.push(m);
    if (sentMail.length > 50) sentMail.shift();
    console.log(`[email] → ${m.to}: ${m.subject}\n${m.text}`);
  },
};

const fromName = () => process.env.EMAIL_FROM_NAME ?? "Dawri — دوري";

const brevoMailer: Mailer = {
  async send(m) {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": process.env.BREVO_API_KEY!, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: { email: process.env.EMAIL_FROM, name: fromName() },
        to: [{ email: m.to }],
        subject: m.subject,
        htmlContent: m.html,
        textContent: m.text,
      }),
    });
    if (!res.ok) throw new Error(`brevo ${res.status}: ${(await res.text()).slice(0, 200)}`);
  },
};

const resendMailer: Mailer = {
  async send(m) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${fromName()} <${process.env.EMAIL_FROM}>`, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
    });
    if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  },
};

type G = { __dawriMailer?: Mailer | null };
const g = globalThis as G;

/** للاختبارات: undefined = الإعداد العادي. */
export function setMailer(m: Mailer | null | undefined) {
  g.__dawriMailer = m;
}

export function getMailer(): Mailer | null {
  if (g.__dawriMailer !== undefined) return g.__dawriMailer;
  const p = process.env.EMAIL_PROVIDER;
  if (p === "brevo" && process.env.BREVO_API_KEY && process.env.EMAIL_FROM) return brevoMailer;
  if (p === "resend" && process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return resendMailer;
  if (p === "console" || (!p && !process.env.DATABASE_URL)) return consoleMailer;
  return null;
}
