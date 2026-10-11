/**
 * إرسال الرسائل القصيرة. المزوّد يُختار بالمتغيّر SMS_PROVIDER:
 *  - console : يطبع الرسالة في سجلّ الخادم (للتطوير والتجربة).
 *  - twilio  : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
 *  - webhook : SMS_WEBHOOK_URL (+ SMS_WEBHOOK_TOKEN) — يُرسَل {to, text} بصيغة JSON،
 *              لربط أيّ بوّابة رسائل جزائرية.
 */
export interface SmsSender {
  send(to: string, text: string): Promise<void>;
}

export const sentSms: { to: string; text: string }[] = [];

const consoleSender: SmsSender = {
  async send(to, text) {
    sentSms.push({ to, text });
    if (sentSms.length > 100) sentSms.shift();
    console.log(`[sms] → ${to}: ${text}`);
  },
};

const twilioSender: SmsSender = {
  async send(to, text) {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const token = process.env.TWILIO_AUTH_TOKEN!;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: text }),
    });
    if (!res.ok) throw new Error(`twilio ${res.status}: ${await res.text()}`);
  },
};

const webhookSender: SmsSender = {
  async send(to, text) {
    const res = await fetch(process.env.SMS_WEBHOOK_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.SMS_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.SMS_WEBHOOK_TOKEN}` } : {}),
      },
      body: JSON.stringify({ to, text }),
    });
    if (!res.ok) throw new Error(`sms webhook ${res.status}`);
  },
};

export function smsProvider(): "console" | "twilio" | "webhook" | null {
  const p = process.env.SMS_PROVIDER ?? (process.env.DATABASE_URL ? "" : "console");
  return p === "console" || p === "twilio" || p === "webhook" ? p : null;
}

export function getSms(): SmsSender | null {
  switch (smsProvider()) {
    case "console":
      return consoleSender;
    case "twilio":
      return twilioSender;
    case "webhook":
      return webhookSender;
    default:
      return null;
  }
}
