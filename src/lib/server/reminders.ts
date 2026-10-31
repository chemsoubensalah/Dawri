/**
 * تذكير صباح يوم الموعد: رسالة SMS واحدة من هاتف العيادة (SMS Gateway) لكلّ موعد محجوز اليوم:
 * «{العيادة}: تذكير بموعدك اليوم على الساعة 10:30. للتفاصيل أو الإلغاء: …/a/…».
 *
 *  - لا قبل السابعة صباحاً (بتوقيت الجزائر)، ولا لموعد فات وقته، ولا لمن حجز اليوم نفسه (يعرف موعده).
 *  - مرّة واحدة: reminded_at يُحجز ذرّياً قبل الإرسال؛ فشل مؤكَّد ← يُفرَّغ فيُعاد لاحقاً؛ نتيجة مجهولة ← لا نسخة ثانية.
 *  - يُشغَّل من مهمّة يومية (Vercel Cron 06:00 UTC = 07:00–08:00 بالجزائر، أو crontab على خادم آخر: /api/cron/reminders)
 *    ومن نشاط العيادة نفسه بعد السابعة (لوحة السكرتيرة وصفحة المرضى) — فلا يتعلّق بالاستضافة.
 *  - لا معلومة طبّية في الرسالة (لا سبب الزيارة).
 */
import { localTime, dayKey, parseHHMM, TIME_ZONE } from "../domain/time";
import type { Lang } from "../domain/types";
import { now as clockNow } from "./clock";
import { getDb } from "./db";
import * as repo from "./repo";
import { background, clinicSmsText, GatewayError, getShopSmsSender } from "./smsgate";

/** لا رسائل قبل 07:00 بتوقيت الجزائر */
export const REMINDER_FROM_MIN = 7 * 60;
/** المهمّة اليومية مهلتها 60 ث: نتوقّف عند 45 ث ويُكمل ما بقي النشاطُ التالي */
const CRON_BUDGET_MS = 45_000;
/** من نشاط العيادة: عيادة واحدة، في الخلفية، وقت قصير */
const LAZY_BUDGET_MS = 8_000;
/** فحص واحد لكلّ عيادة كلّ 5 دقائق على الأكثر (لكلّ نسخة من الخادم؛ الحجز الذرّي يمنع التكرار بين النسخ) */
const LAZY_EVERY_MS = 5 * 60_000;

/** عنوان الموقع للرابط في الرسالة (null = رسالة بلا رابط). */
export function appBaseUrl(fallback?: string | null): string | null {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return fallback ? fallback.replace(/\/$/, "") : null;
}

export interface ReminderResult {
  sent: number;
  failed: number;
  skipped: number;
}

export async function sendMorningReminders(o: { shopId?: string | null; base?: string | null; budgetMs?: number } = {}): Promise<ReminderResult> {
  const started = Date.now();
  const budget = o.budgetMs ?? CRON_BUDGET_MS;
  const out: ReminderResult = { sent: 0, failed: 0, skipped: 0 };
  const now = clockNow();
  const nowMin = localTime(now).minutes;
  if (nowMin < REMINDER_FROM_MIN) return out;
  const today = dayKey(now);
  const db = await getDb();
  const rows = await db.query<{ id: string; shop_id: string; time: string; phone: string; lang: string }>(
    `select a.id, a.shop_id, a.time, a.phone, a.lang from appointments a
       join sms_gateways g on g.shop_id = a.shop_id
      where a.day = $1 and a.status = 'booked' and a.reminded_at is null and a.phone is not null
        and g.enabled and g.send_reminder
        and to_char(a.created_at at time zone '${TIME_ZONE}', 'YYYY-MM-DD') < $1
        and ($2::text is null or a.shop_id::text = $2)
      order by a.shop_id, a.time
      limit 500`,
    [today, o.shopId ?? null],
  );
  const base = appBaseUrl(o.base);
  const byShop = new Map<string, typeof rows>();
  for (const r of rows) byShop.set(String(r.shop_id), [...(byShop.get(String(r.shop_id)) ?? []), r]);

  for (const [shopId, list] of byShop) {
    const shop = await repo.getShopById(db, shopId);
    // مطفأ، أو الهاتف لا يردّ منذ قليل (قاطع الدائرة): نعيد المحاولة في النشاط التالي
    const sender = shop ? await getShopSmsSender(shop, "reminder") : null;
    if (!shop || !sender) {
      out.skipped += list.length;
      continue;
    }
    for (const a of list) {
      if (Date.now() - started > budget) return out;
      // فات وقته (المهمّة تأخّرت): لا رسالة بعد الموعد
      if (parseHHMM(String(a.time))! <= nowMin) {
        out.skipped++;
        continue;
      }
      const claimed = await db.query("update appointments set reminded_at = $2 where id = $1 and reminded_at is null and status = 'booked' returning id", [a.id, now]);
      if (!claimed.length) continue;
      const lang: Lang = a.lang === "fr" ? "fr" : "ar";
      const text = clinicSmsText("reminder", lang, shop.name, { time: String(a.time), url: base ? `${base}/a/${a.id}` : null });
      try {
        await sender.send(String(a.phone), text);
        out.sent++;
      } catch (e) {
        out.failed++;
        console.error("[reminders]", (e as Error).message);
        // فشل مؤكَّد: نعيد فتحه للمحاولة لاحقاً. نتيجة مجهولة (ربّما وصلت): لا نسخة ثانية
        if (!(e instanceof GatewayError && e.unknown)) {
          await db.query("update appointments set reminded_at = null where id = $1", [a.id]).catch(() => {});
        }
      }
    }
  }
  return out;
}

const lastLazy = new Map<string, number>();

/**
 * من نشاط العيادة (لوحة السكرتيرة، صفحة المرضى): تذكيرات هذه العيادة في الخلفية، بعد السابعة،
 * مرّة كلّ 5 دقائق على الأكثر — احتياط إن لم تعمل المهمّة اليومية (أو على استضافة بلا مهمّة).
 */
export function remindInBackground(shopId: string) {
  const now = clockNow();
  if (localTime(now).minutes < REMINDER_FROM_MIN) return;
  const last = lastLazy.get(shopId);
  if (last !== undefined && now.getTime() - last < LAZY_EVERY_MS && now.getTime() >= last) return;
  lastLazy.set(shopId, now.getTime());
  background(async () => {
    await sendMorningReminders({ shopId, budgetMs: LAZY_BUDGET_MS });
  });
}
