/**
 * حدود المحاولات (جدول rate_limits): نافذة منزلقة ذرّية لكلّ مفتاح.
 * تُستعمل لرموز التحقّق لكلّ عميل (عنوان IP)، ولرموز الحجز لكلّ عيادة، ولحدود هاتف العيادة (smsgate.ts).
 * لا نخزّن عنوان IP صريحاً: بصمة مُجزّأة فقط، وتُحذف الصفوف بعد يومين بلا نشاط.
 */
import crypto from "node:crypto";
import net from "node:net";
import { DomainError } from "../domain/types";
import type { Q } from "./db";

const STALE_MS = 2 * 86_400_000;

/**
 * يحجز مكاناً إن بقي أقلّ من max محاولة خلال النافذة. true = مسموح (وتُحسب المحاولة).
 * عبارة واحدة: insert … on conflict do update … where — Postgres يعيد تقييم الشرط على الصفّ المقفل،
 * فلا تتجاوز طلبات متزامنة الحدّ.
 */
export async function claimRate(q: Q, key: string, windowMs: number, max: number, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - windowMs);
  const rows = await q.query(
    `insert into rate_limits as r (key, hits, updated_at) values ($1, array[$3::timestamptz], $3)
     on conflict (key) do update
        set hits = array_append(array(select x from unnest(r.hits) as x where x > $2 order by x), $3::timestamptz),
            updated_at = $3
      where (select count(*) from unnest(r.hits) as x where x > $2) < $4
     returning key`,
    [key, since, now, max],
  );
  // تنظيف خفيف (فهرس updated_at): مفاتيح عملاء لم يعودوا
  await q.query("delete from rate_limits where updated_at < $1", [new Date(now.getTime() - STALE_MS)]).catch(() => {});
  return rows.length > 0;
}

/** عدد المحاولات خلال النافذة (للعرض أو لقرار مبكّر غير ذرّي). */
export async function rateCount(q: Q, key: string, windowMs: number, now: Date): Promise<number> {
  const rows = await q.query<{ n: number }>(
    "select (select count(*) from unnest(hits) as x where x > $2)::int as n from rate_limits where key = $1",
    [key, new Date(now.getTime() - windowMs)],
  );
  return rows[0] ? Number(rows[0].n) : 0;
}

// ————————————————————————— العميل (عنوان IP) —————————————————————————

/**
 * عنوان العميل: x-real-ip ثمّ أوّل عنوان في x-forwarded-for. على Vercel كلاهما يضعه الخادم (لا يُزوَّر)؛
 * خلف nginx يُضاف x-forwarded-for إلى ما أرسله العميل بينما x-real-ip = عنوان الاتّصال، فنقدّمه.
 * null إن لم يوجد أو لم يكن عنوان IP صالحاً (عندها لا يُطبَّق حدّ العميل).
 */
export function clientIp(headers: Headers): string | null {
  const raw = headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  let ip = raw;
  const v4port = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(ip);
  if (v4port) ip = v4port[1];
  const v6port = /^\[([0-9a-fA-F:.]+)\](?::\d+)?$/.exec(ip);
  if (v6port) ip = v6port[1];
  return net.isIP(ip) ? ip.toLowerCase() : null;
}

/** IPv6 يُجمَع على /64 (عميل واحد يملك عادةً /64 كاملاً)؛ IPv4 كما هو. */
function ipScope(ip: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1];
  if (!net.isIPv6(ip)) return ip;
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/** بصمة العميل (لا نحفظ العنوان نفسه). */
export function ipBucket(ip: string): string {
  return crypto
    .createHash("sha256")
    .update(`dawri-ip|${process.env.SESSION_SECRET ?? ""}|${ipScope(ip)}`)
    .digest("base64url")
    .slice(0, 22);
}

/** رموز SMS لكلّ عميل خلال 10 دقائق (ضدّ إغراق أرقام عشوائية برسائل مدفوعة من عنوان واحد). */
export const IP_WINDOW_MS = 10 * 60_000;
export const IP_LIMITS = {
  /** رمز أخذ الرقم: أعلى قليلاً (مرضى عند باب العيادة قد يتشاركون شبكة واحدة) */
  code: 10,
  booking: 5,
} as const;

/** يحجز محاولة لهذا العميل أو يرمي too_many_codes (429). بلا عنوان معروف: لا حدّ. */
export async function guardClientIp(q: Q, ip: string | null | undefined, kind: keyof typeof IP_LIMITS, now: Date) {
  if (!ip) return;
  if (!(await claimRate(q, `ip:${kind}:${ipBucket(ip)}`, IP_WINDOW_MS, IP_LIMITS[kind], now))) {
    throw new DomainError("too_many_codes", 429);
  }
}
