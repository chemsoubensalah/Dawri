/**
 * واتساب (WhatsApp Business Platform – Cloud API من Meta مباشرة).
 *
 * التصميم: المريض يراسلنا أوّلاً عبر رابط wa.me فيه رمز قصير. هذا:
 *  - يثبت أنّ رقم الواتساب له (بديل مجّاني عن رمز SMS)،
 *  - ويفتح «نافذة خدمة» 24 ساعة نرسل فيها تنبيهات دوره برسائل نصّية عادية،
 *  - وكلّ ردّ منه (زرّ «قادم») يجدّد النافذة.
 * خارج النافذة: قالب «utility» معتمد (اختياري) عبر WHATSAPP_TEMPLATE_TURN.
 * لا معلومات طبّية في الرسائل أبداً: رقم التذكرة، اسم العيادة، الدور فقط.
 *
 * المتغيّرات: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET,
 *   WHATSAPP_VERIFY_TOKEN, WHATSAPP_NUMBER (أرقام فقط، مثل 213550123456),
 *   WHATSAPP_GRAPH_VERSION (افتراضياً v26.0), WHATSAPP_TEMPLATE_TURN (اختياري).
 */
import crypto from "node:crypto";

export function waConfig() {
  const token = process.env.WHATSAPP_TOKEN ?? "";
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
  const number = (process.env.WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  return {
    token,
    phoneId,
    number,
    appSecret: process.env.WHATSAPP_APP_SECRET ?? "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
    version: process.env.WHATSAPP_GRAPH_VERSION ?? "v26.0",
    templateTurn: process.env.WHATSAPP_TEMPLATE_TURN ?? "",
    enabled: Boolean(token && phoneId && number),
  };
}

// ——— الرموز القصيرة ———

/** حروف بلا التباس (لا 0/O ولا 1/I/L). */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function shortCode(len = 5): string {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  return s;
}

/** نصّ الرسالة المكتوبة مسبقاً في رابط wa.me. */
export function verifyMessage(code: string) {
  return `دوري: تأكيد رقمي V-${code}\nDawri : confirmer mon numéro V-${code}`;
}
export function alertsMessage(code: string) {
  return `دوري: فعّل تنبيهات تذكرتي T-${code}\nDawri : activer mes alertes T-${code}`;
}

export function waLink(text: string): string | null {
  const { number } = waConfig();
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null;
}

export type ParsedIntent =
  | { kind: "verify"; code: string }
  | { kind: "alerts"; code: string }
  | { kind: "coming"; ticketId: string }
  | { kind: "cancel"; ticketId: string }
  | { kind: "stop" }
  | { kind: "other" };

const CODE = `[${ALPHABET}]{5}`;

/** يفهم ما أرسله المريض (قد يعدّل النصّ أو يكتب بأحرف صغيرة). */
export function parseIntent(text: string | null, buttonId: string | null): ParsedIntent {
  if (buttonId) {
    const m = /^(c|x):([0-9a-f-]{36})$/.exec(buttonId);
    if (m) return m[1] === "c" ? { kind: "coming", ticketId: m[2] } : { kind: "cancel", ticketId: m[2] };
  }
  const t = (text ?? "").toUpperCase();
  const v = new RegExp(`\\bV-?(${CODE})\\b`).exec(t);
  if (v) return { kind: "verify", code: v[1] };
  const a = new RegExp(`\\bT-?(${CODE})\\b`).exec(t);
  if (a) return { kind: "alerts", code: a[1] };
  if (/^\s*(STOP|ARRET|ARRÊT|توقف|إيقاف)\s*$/i.test(text ?? "")) return { kind: "stop" };
  return { kind: "other" };
}

// ——— Webhook ———

/** X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(سرّ التطبيق، الجسم الخام). */
export function verifySignature(raw: string, header: string | null, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(raw, "utf8").digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface Inbound {
  id: string;
  from: string | null; // رقم المرسل (أرقام بلا +) — قد يغيب لمستخدمي «اسم المستخدم»
  userId: string | null; // المعرّف الخاصّ بالأعمال (BSUID)
  timestamp: Date;
  text: string | null;
  buttonId: string | null;
}

/** يستخرج الرسائل الواردة من حمولة Meta. */
export function parseInbound(payload: unknown): Inbound[] {
  const out: Inbound[] = [];
  const p = payload as { entry?: { changes?: { field?: string; value?: Record<string, unknown> }[] }[] };
  for (const entry of p?.entry ?? []) {
    for (const ch of entry.changes ?? []) {
      if (ch.field !== "messages" || !ch.value) continue;
      const v = ch.value as {
        contacts?: { wa_id?: string; user_id?: string }[];
        messages?: {
          id?: string;
          from?: string;
          from_user_id?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          interactive?: { button_reply?: { id?: string; title?: string } };
          button?: { payload?: string; text?: string };
        }[];
      };
      const contact = v.contacts?.[0];
      for (const m of v.messages ?? []) {
        if (!m.id) continue;
        out.push({
          id: m.id,
          from: m.from ?? contact?.wa_id ?? null,
          userId: m.from_user_id ?? contact?.user_id ?? null,
          timestamp: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(),
          text: m.text?.body ?? m.button?.text ?? null,
          buttonId: m.interactive?.button_reply?.id ?? m.button?.payload ?? null,
        });
      }
    }
  }
  return out;
}

// ——— الإرسال ———

export interface WaRecipient {
  phone: string | null; // +2135…
  userId: string | null;
}

function recipientFields(r: WaRecipient): Record<string, string> {
  // نفضّل رقم الهاتف (Meta توصي به)، وإلّا المعرّف الخاصّ BSUID
  if (r.phone) return { to: r.phone.replace(/\D/g, "") };
  if (r.userId) return { recipient: r.userId };
  throw new Error("no whatsapp recipient");
}

type Sender = (body: Record<string, unknown>) => Promise<void>;

const graphSender: Sender = async (body) => {
  const c = waConfig();
  const res = await fetch(`https://graph.facebook.com/${c.version}/${c.phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`whatsapp ${res.status}: ${(await res.text()).slice(0, 300)}`);
};

type G = { __dawriWaSender?: Sender };
const g = globalThis as G;

/** للاختبارات: التقاط الرسائل بدل إرسالها. */
export function setWaSender(s: Sender | undefined) {
  g.__dawriWaSender = s;
}

async function send(body: Record<string, unknown>) {
  await (g.__dawriWaSender ?? graphSender)({ messaging_product: "whatsapp", recipient_type: "individual", ...body });
}

export function waSendText(r: WaRecipient, text: string) {
  return send({ ...recipientFields(r), type: "text", text: { preview_url: false, body: text.slice(0, 4000) } });
}

/** رسالة بأزرار ردّ (حتى 3 أزرار، عنوان كلّ زرّ ≤ 20 حرفاً). */
export function waSendButtons(r: WaRecipient, text: string, buttons: { id: string; title: string }[]) {
  return send({
    ...recipientFields(r),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: text.slice(0, 1024) },
      action: { buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })) },
    },
  });
}

/** قالب معتمد (خارج نافذة الـ24 ساعة). المعاملات بالترتيب {{1}} {{2}} … */
export function waSendTemplate(r: WaRecipient, name: string, lang: string, params: string[]) {
  return send({
    ...recipientFields(r),
    type: "template",
    template: {
      name,
      language: { code: lang },
      components: [{ type: "body", parameters: params.map((p) => ({ type: "text", text: p })) }],
    },
  });
}
