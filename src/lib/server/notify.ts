/**
 * إرسال التنبيهات بعد كلّ تغيير في الطابور.
 * القناة الأساسية: Web Push (مجّاني، يعمل بلا تثبيت على أندرويد/كروم).
 * اختيارياً: رسائل SMS (SMS_NOTIFICATIONS) — لها كلفة:
 *   1 أو all  ← «تعال الآن» + «دورك الآن»
 *   called    ← «دورك الآن» فقط (الأوفر)
 *   soon      ← «تعال الآن» فقط
 * تصل أيضاً لمن أضافته السكرتيرة برقم هاتفه (الكبار بلا هاتف ذكي).
 * وفي كلّ الأحوال: صفحة التذكرة المفتوحة تُصدر صوتاً واهتزازاً بنفسها.
 */
import { t, type DictKey } from "../i18n";
import type { NotifyType, Shop, Ticket } from "../domain/types";
import { getDb } from "./db";
import * as repo from "./repo";
import { getSms } from "./sms";
import { waConfig, waSendButtons, waSendTemplate, waSendText } from "./whatsapp";

export interface Notification {
  type: NotifyType;
  ticket: Ticket;
  shop: Shop;
  ahead: number | null;
}

export interface Notifier {
  send(n: Notification): Promise<void>;
}

export function renderNotification(n: Notification) {
  const vars = {
    shop: n.shop.name,
    n: n.ticket.number,
    a: n.ahead ?? "",
    m: n.shop.settings.lateWindowMin,
  };
  let body = t(n.ticket.lang, `n_${n.type}_body` as DictKey, vars);
  // «تعال الآن» قد يصل قبل أن يردّ على سؤال التأكيد: نذكّره به
  if (n.type === "soon" && n.ticket.confirmAskedAt && !n.ticket.confirmedAt) {
    body += " " + t(n.ticket.lang, "n_soon_confirm");
  }
  return {
    title: t(n.ticket.lang, `n_${n.type}_title` as DictKey, vars),
    body,
    url: `/t/${n.ticket.id}`,
    tag: `dawri-${n.ticket.id}`,
  };
}

const SMS_ALLOWED: NotifyType[] = ["soon", "called", "missed", "confirm", "held", "approved"];

/** أيّ الأحداث تُرسَل برسالة SMS (من SMS_NOTIFICATIONS). */
export function smsTypes(): Set<NotifyType> {
  const v = (process.env.SMS_NOTIFICATIONS ?? "").trim().toLowerCase();
  if (!v || v === "0" || v === "off") return new Set();
  if (v === "1" || v === "all" || v === "on") return new Set(["soon", "called"]);
  return new Set(v.split(",").map((x) => x.trim() as NotifyType).filter((x) => SMS_ALLOWED.includes(x)));
}

/** يُرجع true إن أُرسلت رسالة واتساب. */
async function sendWhatsapp(n: Notification, msg: ReturnType<typeof renderNotification>): Promise<boolean> {
  const r = { phone: n.ticket.waPhone, userId: n.ticket.waUserId };
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const text = [`*${msg.title}*`, msg.body, base ? `${base}${msg.url}` : null].filter(Boolean).join("\n");
  const windowOpen = n.ticket.waWindowUntil && n.ticket.waWindowUntil > new Date();
  if (windowOpen) {
    const askConfirm = n.type === "confirm" || n.type === "held" || (n.type === "soon" && n.ticket.confirmAskedAt && !n.ticket.confirmedAt);
    if (askConfirm) {
      await waSendButtons(r, text, [
        { id: `c:${n.ticket.id}`, title: t(n.ticket.lang, "wa_btnComing") },
        { id: `x:${n.ticket.id}`, title: t(n.ticket.lang, "wa_btnCancel") },
      ]);
    } else {
      await waSendText(r, text);
    }
    return true;
  }
  const tpl = waConfig().templateTurn;
  if (tpl && (n.type === "soon" || n.type === "called")) {
    await waSendTemplate(r, tpl, n.ticket.lang, [n.shop.name, String(n.ticket.number)]);
    return true;
  }
  return false;
}

let vapidReady: boolean | null = null;

async function webPush() {
  const wp = (await import("web-push")).default;
  if (vapidReady === null) {
    const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    vapidReady = Boolean(pub && priv);
    if (vapidReady) wp.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@dawri.app", pub!, priv!);
  }
  return vapidReady ? wp : null;
}

export const defaultNotifier: Notifier = {
  async send(n) {
    const msg = renderNotification(n);
    const db = await getDb();
    const sub = await repo.getPushSub(db, n.ticket.id);
    if (sub) {
      const wp = await webPush();
      if (wp) {
        try {
          await wp.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(msg),
            { TTL: 600, urgency: "high" },
          );
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await repo.deletePushSub(db, n.ticket.id);
          else console.error("[push]", code, (e as Error).message);
        }
      }
    }
    // واتساب: داخل نافذة الـ24 ساعة رسالة عادية (بأزرار لسؤال التأكيد)، وخارجها قالب معتمد إن وُجد
    const waLinked = (n.ticket.waUserId || n.ticket.waPhone) && !n.ticket.waOptOut;
    let waSent = false;
    if (waLinked && waConfig().enabled) {
      try {
        waSent = await sendWhatsapp(n, msg);
      } catch (e) {
        console.error("[whatsapp] send", e);
      }
    }
    // SMS فقط لمن لم يصله واتساب (توفير الكلفة)
    // من أوقف التنبيهات (STOP) لا تصله رسائل SMS أيضاً
    if (!waSent && !n.ticket.waOptOut && n.ticket.phone && smsTypes().has(n.type)) {
      const sms = getSms();
      await sms?.send(n.ticket.phone, `${msg.title} ${msg.body}`).catch((e) => console.error("[sms]", e));
    }
  },
};

type G = { __dawriNotifier?: Notifier };
const g = globalThis as G;

export function getNotifier(): Notifier {
  return g.__dawriNotifier ?? defaultNotifier;
}

/** للاختبارات. */
export function setNotifier(n: Notifier | undefined) {
  g.__dawriNotifier = n;
}
