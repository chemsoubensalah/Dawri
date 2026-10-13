/**
 * إحصائيات لوحة المؤسّس: تسجيل الزيارات (مجهول الهويّة) + أرقام المرضى والأطبّاء والمداخيل.
 * الزائر = بصمة يومية (sha256 لسرّ + اليوم + IP + المتصفّح) تتغيّر كلّ يوم: لا كوكي ولا IP محفوظ.
 */
import crypto from "node:crypto";
import { addDays } from "@/lib/domain/appointments";
import { dayKey, localTime, TIME_ZONE } from "@/lib/domain/time";
import { now as clockNow } from "./clock";
import { getDb, type Q } from "./db";

export type Section = "home" | "shop" | "ticket" | "appt" | "tv" | "doctors" | "signup" | "staff" | "clinic" | "other";
export type Source = "direct" | "qr" | "internal" | "google" | "facebook" | "instagram" | "whatsapp" | "tiktok" | "other";
export type Device = "mobile" | "desktop" | "tv";

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|node-fetch/i;
const SLUG = /^[a-z0-9][a-z0-9-]{2,39}$/;

/** المسار ← القسم (+ اسم الطبيب/العيادة في الرابط). null = لا يُعدّ (لوحة المؤسّس، الـ API…). */
export function classifyPath(path: string): { section: Section; shop: string } | null {
  if (typeof path !== "string" || path.length > 200 || !path.startsWith("/")) return null;
  const [, a = "", b = ""] = path.toLowerCase().split("/");
  const slug = SLUG.test(b) ? b : "";
  switch (a) {
    case "":
      return { section: "home", shop: "" };
    case "admin":
    case "api":
      return null;
    case "s":
      return slug ? { section: "shop", shop: slug } : null;
    case "d":
      return slug ? { section: "tv", shop: slug } : null;
    case "staff":
      return slug ? { section: "staff", shop: slug } : null;
    case "c":
      return slug ? { section: "clinic", shop: slug } : null;
    case "t":
      return { section: "ticket", shop: "" };
    case "a":
      return { section: "appt", shop: "" };
    case "doctors":
      return { section: "doctors", shop: "" };
    case "new":
      return { section: "signup", shop: "" };
    default:
      return { section: "other", shop: "" };
  }
}

export function classifySource(referrer: unknown, qr: boolean, ownHost: string | null): Source {
  if (qr) return "qr";
  if (typeof referrer !== "string" || !referrer) return "direct";
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "direct";
  }
  if (ownHost && (host === ownHost || host.endsWith(`.${ownHost}`))) return "internal";
  if (/(^|\.)google\./.test(host)) return "google";
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/.test(host)) return "facebook";
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)(whatsapp\.com|wa\.me)$/.test(host)) return "whatsapp";
  if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
  return "other";
}

export function classifyDevice(ua: string): Device {
  if (/smart-?tv|\btv\b|tizen|web0?os|hbbtv|android tv|googletv|bravia|aft[a-z]/i.test(ua)) return "tv";
  return /mobi|android|iphone|ipad|ipod/i.test(ua) ? "mobile" : "desktop";
}

export function isBot(ua: string): boolean {
  return !ua || BOT.test(ua);
}

/** بصمة يومية: نفس الزائر يُعدّ مرّة في اليوم، ولا يمكن ربطه بيوم آخر ولا استرجاع الـ IP منها. */
export function visitorId(day: string, ip: string | null, ua: string): string {
  return crypto
    .createHash("sha256")
    .update(`dawri-visit|${process.env.SESSION_SECRET ?? ""}|${day}|${ip ?? ""}|${ua}`)
    .digest("base64url")
    .slice(0, 22);
}

export async function recordVisit(input: { path: unknown; referrer: unknown; qr: unknown; ip: string | null; ua: string; ownHost: string | null }) {
  if (isBot(input.ua)) return false;
  const where = classifyPath(String(input.path ?? ""));
  if (!where) return false;
  const t = clockNow();
  const lt = localTime(t);
  const db = await getDb();
  await db.query(
    `insert into visits (day, vid, section, shop, device, source, hour)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (day, vid, section, shop) do update set views = least(visits.views + 1, 500)`,
    [
      lt.day,
      visitorId(lt.day, input.ip, input.ua.slice(0, 300)),
      where.section,
      where.shop,
      classifyDevice(input.ua),
      classifySource(input.referrer, input.qr === true, input.ownHost),
      Math.floor(lt.minutes / 60),
    ],
  );
  return true;
}

/** الزيارات أقدم من 13 شهراً تُحذف (يكفي للمقارنة السنوية). */
export async function purgeVisits(q: Q, before: string) {
  await q.query("delete from visits where day < $1", [before]);
}

// ————————————————————————— أرقام لوحة المؤسّس —————————————————————————

export interface Kpis {
  visitors: number;
  views: number;
  patients: number;
  online: number;
  served: number;
  noShows: number;
  waitMin: number | null;
  signups: number;
  revenue: number;
  appointments: number;
}

export interface AdminStats {
  range: number;
  days: string[];
  kpi: Kpis;
  prev: Kpis;
  activeDoctors: number;
  totals: { patients: number; doctors: number; revenue: number; reviews: number; rating: number | null };
  visitsDaily: { day: string; visitors: number; views: number }[];
  ticketsDaily: { day: string; online: number; desk: number }[];
  signupsDaily: { day: string; n: number }[];
  revenueMonthly: { month: string; amount: number }[];
  hours: number[];
  weekdays: number[];
  sections: { key: string; n: number }[];
  sources: { key: string; n: number }[];
  devices: { key: string; n: number }[];
  topPages: { slug: string; name: string; n: number }[];
  topDoctors: { slug: string; name: string; n: number }[];
  wilayas: { code: number | null; n: number }[];
  outcomes: { key: string; n: number }[];
}

const n = (v: unknown) => Number(v ?? 0) || 0;
const TZ = `'${TIME_ZONE}'`;

async function kpis(q: Q, from: string, to: string): Promise<Kpis> {
  const [v, t, s, r, a] = await Promise.all([
    q.query("select count(*) as visitors, coalesce(sum(views),0) as views from visits where day between $1 and $2", [from, to]),
    q.query(
      `select count(*) as patients,
              count(*) filter (where source = 'online') as online,
              count(*) filter (where status = 'done') as served,
              count(*) filter (where status = 'no_show') as no_shows,
              avg(extract(epoch from (called_at - coalesce(arrived_at, created_at))) / 60)
                filter (where called_at is not null and called_at > coalesce(arrived_at, created_at)
                        and called_at - coalesce(arrived_at, created_at) < interval '6 hours') as wait
       from tickets where day between $1 and $2`,
      [from, to],
    ),
    q.query(`select count(*) as n from shops where to_char(created_at at time zone ${TZ}, 'YYYY-MM-DD') between $1 and $2`, [from, to]),
    q.query(
      `select coalesce(sum(amount),0) as n from payments
       where status = 'paid' and to_char(coalesce(paid_at, created_at) at time zone ${TZ}, 'YYYY-MM-DD') between $1 and $2`,
      [from, to],
    ),
    q.query("select count(*) as n from appointments where to_char(created_at at time zone " + TZ + ", 'YYYY-MM-DD') between $1 and $2", [from, to]),
  ]);
  const wait = t[0]?.wait;
  return {
    visitors: n(v[0]?.visitors),
    views: n(v[0]?.views),
    patients: n(t[0]?.patients),
    online: n(t[0]?.online),
    served: n(t[0]?.served),
    noShows: n(t[0]?.no_shows),
    waitMin: wait == null ? null : Math.round(Number(wait)),
    signups: n(s[0]?.n),
    revenue: n(r[0]?.n),
    appointments: n(a[0]?.n),
  };
}

export async function adminStats(range: number): Promise<AdminStats> {
  const db = await getDb();
  const today = dayKey(clockNow());
  const from = addDays(today, -(range - 1));
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(range - 1));
  const days = Array.from({ length: range }, (_, i) => addDays(from, i));
  const month0 = addDays(today, -400).slice(0, 7);
  const act = addDays(today, -6);
  const span = [from, today];

  const [kpi, prev, vd, td, sd, rm, hr, wd, sec, src, dev, pages, docs, wil, out, active, totals] = await Promise.all([
    kpis(db, from, today),
    kpis(db, prevFrom, prevTo),
    db.query("select day, count(*) as visitors, sum(views) as views from visits where day between $1 and $2 group by day", span),
    db.query(
      `select day, count(*) filter (where source = 'online') as online, count(*) filter (where source = 'desk') as desk
       from tickets where day between $1 and $2 group by day`,
      span,
    ),
    db.query(
      `select to_char(created_at at time zone ${TZ}, 'YYYY-MM-DD') as day, count(*) as n from shops
       where to_char(created_at at time zone ${TZ}, 'YYYY-MM-DD') between $1 and $2 group by 1`,
      span,
    ),
    db.query(
      `select to_char(coalesce(paid_at, created_at) at time zone ${TZ}, 'YYYY-MM') as month, sum(amount) as amount from payments
       where status = 'paid' and to_char(coalesce(paid_at, created_at) at time zone ${TZ}, 'YYYY-MM') >= $1 group by 1`,
      [month0],
    ),
    db.query(
      `select extract(hour from created_at at time zone ${TZ})::int as h, count(*) as n from tickets
       where day between $1 and $2 group by 1`,
      span,
    ),
    db.query(`select extract(dow from day::date)::int as w, count(*) as n from tickets where day between $1 and $2 group by 1`, span),
    db.query("select section as key, count(*) as n from visits where day between $1 and $2 group by 1 order by 2 desc", span),
    db.query("select source as key, count(*) as n from visits where day between $1 and $2 group by 1 order by 2 desc", span),
    db.query("select device as key, count(*) as n from visits where day between $1 and $2 group by 1 order by 2 desc", span),
    db.query(
      `select v.shop as slug, s.name, count(*) as n from visits v join shops s on s.slug = v.shop
       where v.day between $1 and $2 and v.section = 'shop' group by 1, 2 order by 3 desc limit 10`,
      span,
    ),
    db.query(
      `select s.slug, s.name, count(*) as n from tickets t join shops s on s.id = t.shop_id
       where t.day between $1 and $2 group by 1, 2 order by 3 desc limit 10`,
      span,
    ),
    db.query("select wilaya as code, count(*) as n from shops group by 1 order by 2 desc limit 12"),
    db.query("select status as key, count(*) as n from tickets where day between $1 and $2 group by 1 order by 2 desc", span),
    db.query("select count(distinct shop_id) as n from tickets where day between $1 and $2", [act, today]),
    db.query(
      `select (select count(*) from tickets) as patients, (select count(*) from shops) as doctors,
              (select coalesce(sum(amount),0) from payments where status = 'paid') as revenue,
              (select count(*) from reviews) as reviews, (select avg(rating) from reviews) as rating`,
    ),
  ]);

  const byDay = <T extends Record<string, unknown>>(rows: T[]) => new Map(rows.map((r) => [String(r.day), r]));
  const vMap = byDay(vd);
  const tMap = byDay(td);
  const sMap = byDay(sd);
  const rMap = new Map(rm.map((r) => [String(r.month), n(r.amount)]));
  const months = Array.from({ length: 12 }, (_, i) => {
    const [y, m] = today.slice(0, 7).split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 - (11 - i), 1));
    return d.toISOString().slice(0, 7);
  });
  const hours = Array<number>(24).fill(0);
  for (const r of hr) hours[n(r.h)] = n(r.n);
  const weekdays = Array<number>(7).fill(0);
  for (const r of wd) weekdays[n(r.w)] = n(r.n);
  const kv = (rows: Record<string, unknown>[]) => rows.map((r) => ({ key: String(r.key), n: n(r.n) }));
  const tot = totals[0] ?? {};

  return {
    range,
    days,
    kpi,
    prev,
    activeDoctors: n(active[0]?.n),
    totals: {
      patients: n(tot.patients),
      doctors: n(tot.doctors),
      revenue: n(tot.revenue),
      reviews: n(tot.reviews),
      rating: tot.rating == null ? null : Math.round(Number(tot.rating) * 10) / 10,
    },
    visitsDaily: days.map((day) => ({ day, visitors: n(vMap.get(day)?.visitors), views: n(vMap.get(day)?.views) })),
    ticketsDaily: days.map((day) => ({ day, online: n(tMap.get(day)?.online), desk: n(tMap.get(day)?.desk) })),
    signupsDaily: days.map((day) => ({ day, n: n(sMap.get(day)?.n) })),
    revenueMonthly: months.map((month) => ({ month, amount: rMap.get(month) ?? 0 })),
    hours,
    weekdays,
    sections: kv(sec),
    sources: kv(src),
    devices: kv(dev),
    topPages: pages.map((r) => ({ slug: String(r.slug), name: String(r.name), n: n(r.n) })),
    topDoctors: docs.map((r) => ({ slug: String(r.slug), name: String(r.name), n: n(r.n) })),
    wilayas: wil.map((r) => ({ code: r.code == null ? null : n(r.code), n: n(r.n) })),
    outcomes: kv(out),
  };
}
