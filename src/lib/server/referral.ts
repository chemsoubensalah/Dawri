/**
 * «ادعُ زميلاً: شهر مجّاني لكما».
 *  - العيادة المدعوّة: 90 يوماً مجّاناً بدل 60 (عند التسجيل برمز صالح).
 *  - العيادة الداعية: +30 يوماً عند أوّل دفعة للمدعوّة فقط (لا عند التسجيل — ضدّ الحسابات الوهمية)،
 *    مرّة واحدة لكلّ مدعوّ (rewarded_at)، وبحدّ 12 مكافأة في السنة.
 *  - الدعوة الذاتية (نفس بريد صاحب العيادة) تُتجاهل بصمت، وكذلك الرمز غير الصالح.
 */
import crypto from "node:crypto";
import type { Shop } from "../domain/types";
import type { Q } from "./db";

export const REFERRAL_BONUS_DAYS = 30;
export const REFERRAL_REWARD_DAYS = 30;
export const REFERRAL_YEARLY_CAP = 12;
const DAY_MS = 86_400_000;
// بلا حروف ملتبسة (0/O، 1/I/L) — يُملى بالهاتف بسهولة
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function normalizeRefCode(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const c = v.trim().toUpperCase();
  return /^[A-Z0-9]{6,8}$/.test(c) ? c : null;
}

function newCode(): string {
  const bytes = crypto.randomBytes(7);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}

/** رمز العيادة (يُنشأ عند أوّل طلب). */
export async function ensureReferralCode(q: Q, shopId: string): Promise<string> {
  const existing = await q.query<{ code: string }>("select code from referrals_codes where shop_id = $1", [shopId]);
  if (existing[0]) return existing[0].code;
  for (let i = 0; i < 6; i++) {
    const rows = await q.query<{ code: string }>(
      `insert into referrals_codes (shop_id, code) values ($1, $2)
       on conflict do nothing returning code`,
      [shopId, newCode()],
    );
    if (rows[0]) return rows[0].code;
    // تعارض: إمّا الرمز مأخوذ (نعيد المحاولة) أو أُنشئ للعيادة في طلب موازٍ
    const again = await q.query<{ code: string }>("select code from referrals_codes where shop_id = $1", [shopId]);
    if (again[0]) return again[0].code;
  }
  throw new Error("referral code generation failed");
}

/**
 * يُستدعى بعد إنشاء العيادة. يُرجع تاريخ نهاية التجربة الجديد إن قُبلت الدعوة، وإلّا null.
 * لا يرمي أبداً لرمز سيّئ: الرمز غير الصالح يُتجاهل بصمت.
 */
export async function applyReferral(q: Q, shop: Shop, ref: unknown): Promise<Date | null> {
  const code = normalizeRefCode(ref);
  if (!code) return null;
  const rows = await q.query<{ shop_id: string; owner_email: string | null }>(
    `select c.shop_id, s.owner_email from referrals_codes c join shops s on s.id = c.shop_id where c.code = $1`,
    [code],
  );
  const referrer = rows[0];
  if (!referrer || referrer.shop_id === shop.id) return null;
  const a = (referrer.owner_email ?? "").trim().toLowerCase();
  const b = (shop.ownerEmail ?? "").trim().toLowerCase();
  if (a && b && a === b) return null; // دعوة ذاتية
  const ins = await q.query<{ id: string }>(
    `insert into referrals (referrer_shop_id, referred_shop_id) values ($1, $2)
     on conflict (referred_shop_id) do nothing returning id`,
    [referrer.shop_id, shop.id],
  );
  if (!ins[0]) return null;
  const until = new Date(shop.trialEndsAt.getTime() + REFERRAL_BONUS_DAYS * DAY_MS);
  await q.query("update shops set trial_ends_at = $2 where id = $1", [shop.id, until]);
  return until;
}

/**
 * يُستدعى داخل معاملة الدفع (بعد تسجيل دفعة مدفوعة للعيادة referredShopId).
 * متكرّر-الآمن: rewarded_at يُثبَّت مرّة واحدة؛ الدفعات اللاحقة لا تكافئ مجدّداً.
 */
export async function rewardReferrerOnPayment(q: Q, referredShopId: string, now: Date) {
  const rows = await q.query<{ id: string; referrer_shop_id: string }>(
    `select id, referrer_shop_id from referrals
     where referred_shop_id = $1 and rewarded_at is null for update`,
    [referredShopId],
  );
  const r = rows[0];
  if (!r) return { rewarded: false as const };
  // نقفل صفّ العيادة الداعية: مكافأتان متوازيتان لا تتجاوزان الحدّ ولا تضيعان
  await q.query("select id from shops where id = $1 for update", [r.referrer_shop_id]);
  const yearAgo = new Date(now.getTime() - 365 * DAY_MS);
  const c = await q.query<{ n: number }>(
    `select count(*)::int as n from referrals
     where referrer_shop_id = $1 and reward_days > 0 and rewarded_at >= $2`,
    [r.referrer_shop_id, yearAgo],
  );
  const capped = Number(c[0]?.n ?? 0) >= REFERRAL_YEARLY_CAP;
  const days = capped ? 0 : REFERRAL_REWARD_DAYS;
  await q.query("update referrals set rewarded_at = $2, reward_days = $3 where id = $1", [r.id, now, days]);
  if (days > 0) {
    // نمدّد الفترة الجارية: الاشتراك المدفوع إن كان سارياً، وإلّا التجربة (ولو انتهت: من اليوم)
    await q.query(
      `update shops set
         paid_until    = case when paid_until > $2 then paid_until + make_interval(days => $3) else paid_until end,
         trial_ends_at = case when paid_until > $2 then trial_ends_at
                              else greatest(trial_ends_at, $2::timestamptz) + make_interval(days => $3) end
       where id = $1`,
      [r.referrer_shop_id, now, days],
    );
  }
  return { rewarded: days > 0, referrerShopId: r.referrer_shop_id, capped };
}

export interface ReferralStats {
  code: string;
  invited: number;
  paid: number;
  rewardedMonths: number;
  capped: boolean;
}

export async function referralStats(q: Q, shopId: string, now: Date): Promise<ReferralStats> {
  const code = await ensureReferralCode(q, shopId);
  const rows = await q.query<{ invited: number; paid: number; months: number; recent: number }>(
    `select count(*)::int as invited,
            count(*) filter (where rewarded_at is not null)::int as paid,
            coalesce(sum(reward_days), 0)::int / ${REFERRAL_REWARD_DAYS} as months,
            count(*) filter (where reward_days > 0 and rewarded_at >= $2)::int as recent
     from referrals where referrer_shop_id = $1`,
    [shopId, new Date(now.getTime() - 365 * DAY_MS)],
  );
  const r = rows[0];
  return {
    code,
    invited: Number(r?.invited ?? 0),
    paid: Number(r?.paid ?? 0),
    rewardedMonths: Number(r?.months ?? 0),
    capped: Number(r?.recent ?? 0) >= REFERRAL_YEARLY_CAP,
  };
}

/** للوحة الإدارة: عدد المدعوّين والمكافآت لكلّ عيادة داعية. */
export async function referralCountsAdmin(q: Q): Promise<Map<string, { invited: number; rewarded: number }>> {
  const rows = await q.query<{ id: string; invited: number; rewarded: number }>(
    `select referrer_shop_id as id, count(*)::int as invited, count(*) filter (where reward_days > 0)::int as rewarded
     from referrals group by referrer_shop_id`,
  );
  return new Map(rows.map((r) => [String(r.id), { invited: Number(r.invited), rewarded: Number(r.rewarded) }]));
}
