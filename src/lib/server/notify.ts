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
    if (n.ticket.phone && smsTypes().has(n.type)) {
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
