/**
 * «حدود التسجيل» (src/lib/domain/limits.ts) والحدّ اليوميّ لكلّ حالة (reasons.ts: caps):
 * قراءة الإعداد وحفظه، والفحوص نفسها — داخل معاملة الحجز/الطابور المقفلة على صفّ اليوم،
 * فلا يتجاوز طلبان متزامنان حدّ الحالة.
 *
 * المريض من هاتفه لا يتجاوز الحدود أبداً. السكرتيرة تتجاوزها إن سمح الطبيب، بعد تنبيه:
 * الطلب الأوّل يُرفض بـ vars.override = 1، ثمّ تعيد إرساله بـ force = true.
 */
import { addDays } from "../domain/appointments";
import { cleanLimits, phoneWaitUntil, readLimits, type LimitsConfig } from "../domain/limits";
import { activeReasonConfig, reasonCap, reasonConfigOf } from "../domain/reasons";
import { TIME_ZONE } from "../domain/time";
import { DomainError, type Shop } from "../domain/types";
import { getDb, type Q } from "./db";
import * as repo from "./repo";

export const limitsOf = (shop: Pick<Shop, "limitsCfg">): LimitsConfig => readLimits(shop.limitsCfg);

export function limitsSettingsView(shop: Shop) {
  return { config: limitsOf(shop) };
}

export type LimitsSettingsView = ReturnType<typeof limitsSettingsView>;

export async function saveLimitsSettings(shop: Shop, body: unknown): Promise<LimitsSettingsView> {
  const limitsCfg = cleanLimits(body);
  await repo.updateShop(await getDb(), shop.id, { limitsCfg });
  return limitsSettingsView({ ...shop, limitsCfg });
}

/** من يسجّل: المريض بنفسه، أو الطاقم (force = «أضف رغم ذلك» بعد التنبيه). */
export type Who = { staff: false } | { staff: true; force: boolean };
export const PATIENT: Who = { staff: false };

function refuse(shop: Shop, who: Who, code: string, vars: Record<string, string | number>) {
  const canOverride = who.staff && limitsOf(shop).staffOverride;
  if (canOverride && who.force) return;
  throw new DomainError(code, 409, canOverride ? { ...vars, override: 1 } : vars);
}

/** ما يشغل مكاناً من حدّ الحالة: تذاكر حيّة أو مُنجزة، ومواعيد محجوزة (الموعد الذي وصل صار تذكرة). */
const LIVE_TICKETS = "('waiting', 'called', 'done', 'deferred', 'pending_approval')";

/** الحالة المختارة اكتملت في ذلك اليوم؟ (الطابور والمواعيد معاً) */
export async function checkReasonCap(q: Q, shop: Shop, day: string, reason: string | null | undefined, who: Who) {
  const cap = reasonCap(reasonConfigOf(shop), reason);
  if (cap === null) return;
  const rows = await q.query<{ n: number }>(
    `select (select count(*) from tickets where shop_id = $1 and day = $2 and reason = $3 and status in ${LIVE_TICKETS})
          + (select count(*) from appointments where shop_id = $1 and day = $2 and reason = $3 and status = 'booked') as n`,
    [shop.id, day, reason],
  );
  if (Number(rows[0]?.n ?? 0) >= cap) refuse(shop, who, "reason_full", { reason: reason!, max: cap });
}

/** الحالات المكتملة لكلّ يوم في الفترة — تُعطَّل في صفحة المريض (وتُعلَّم للسكرتيرة). */
export async function fullReasons(q: Q, shop: Shop, from: string, to: string): Promise<Record<string, string[]>> {
  const c = activeReasonConfig(reasonConfigOf(shop));
  if (c.mode !== "list" || !Object.keys(c.caps).length) return {};
  const rows = await q.query<{ day: string; reason: string; n: number }>(
    `select day, reason, count(*) as n from (
       select day, reason from tickets where shop_id = $1 and day between $2 and $3 and reason is not null and status in ${LIVE_TICKETS}
       union all
       select day, reason from appointments where shop_id = $1 and day between $2 and $3 and reason is not null and status = 'booked'
     ) x group by 1, 2`,
    [shop.id, from, to],
  );
  const out: Record<string, string[]> = {};
  for (const r of rows) {
    const cap = c.caps[String(r.reason)];
    if (cap && Number(r.n) >= cap) (out[String(r.day)] ??= []).push(String(r.reason));
  }
  return out;
}

/**
 * المهلة بين تسجيلين لنفس الهاتف، تُحسب من يوم التسجيل (يوم الحجز، أو يوم أخذ الرقم).
 * لا يُحسب: ما أُلغي أو رُفض، ولا تسجيل لنفس يوم الزيارة (موعده اليوم + رقم اليوم = زيارة واحدة).
 * kind = ticket لا يُفحص إلّا إن شمل الطبيب الطابور.
 */
export async function checkPhoneGap(
  q: Q,
  shop: Shop,
  phone: string | null,
  o: { kind: "appt" | "ticket"; today: string; visitDay: string },
  who: Who,
) {
  const c = limitsOf(shop);
  if (!c.phoneDays || !phone || (o.kind === "ticket" && c.phoneScope !== "all")) return;
  const since = addDays(o.today, 1 - c.phoneDays);
  const created = `to_char(created_at at time zone '${TIME_ZONE}', 'YYYY-MM-DD')`;
  const parts = [
    `select max(${created}) as d from appointments
     where shop_id = $1 and phone = $2 and status <> 'cancelled' and day <> $4 and ${created} >= $3`,
  ];
  if (c.phoneScope === "all") {
    parts.push(
      `select max(day) as d from tickets
       where shop_id = $1 and phone = $2 and status not in ('cancelled', 'rejected') and day <> $4 and day >= $3`,
    );
  }
  const rows = await q.query<{ d: string | null }>(`select max(d) as d from (${parts.join(" union all ")}) x`, [shop.id, phone, since, o.visitDay]);
  const until = phoneWaitUntil(c, rows[0]?.d ? String(rows[0].d) : null, o.today);
  if (until) refuse(shop, who, "phone_wait", { day: until });
}

/**
 * رقم جديد في طابور اليوم: المهلة (إن شملت الطابور) ثمّ حدّ الحالة.
 * صاحب موعد اليوم معفى: رقمه وموعده زيارة واحدة (موعده محسوب في الحالة أصلاً).
 */
export async function checkNewTicket(q: Q, shop: Shop, o: { phone: string | null; reason: string | null | undefined; day: string }, who: Who) {
  if (o.phone) {
    const appt = await q.query("select 1 from appointments where shop_id = $1 and day = $2 and phone = $3 and status in ('booked', 'arrived') limit 1", [
      shop.id,
      o.day,
      o.phone,
    ]);
    if (appt.length) return;
    await checkPhoneGap(q, shop, o.phone, { kind: "ticket", today: o.day, visitDay: o.day }, who);
  }
  await checkReasonCap(q, shop, o.day, o.reason, who);
}
