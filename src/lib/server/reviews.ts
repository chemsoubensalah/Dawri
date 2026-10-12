/**
 * التقييمات ودليل العيادات.
 *  - المريض يقيّم زيارته (تذكرة «done») خلال 72 ساعة — معرّف التذكرة هو صلاحيته.
 *  - التقييم لا يحمل اسماً ولا هاتفاً: يبقى بعد تجهيل التذكرة.
 *  - الطبيب يقرّر: إظهار المعدّل على صفحة العيادة، والظهور في الدليل العامّ.
 */
import { DomainError, type Shop, type ShopKind, type ShopProfile, type Ticket } from "../domain/types";
import { dayKey, isWithinHours, localTime, nextOpeningToday } from "../domain/time";
import { isWilaya } from "../domain/wilayas";
import { now as clockNow } from "./clock";
import { getDb, type Q, type Row } from "./db";
import * as repo from "./repo";

const HOUR = 3_600_000;
/** نافذة التقييم بعد الخدمة */
export const REVIEW_WINDOW_H = 72;
/** أقلّ عدد تقييمات لإظهار المعدّل للعموم (تفادياً لضجيج تقييم واحد) */
export const MIN_PUBLIC_COUNT = 3;
export const COMMENT_MAX = 300;
/** حدّ أقصى لتقييمات عيادة واحدة في الساعة (حماية من الإغراق) */
const SHOP_HOURLY_CAP = 60;

export interface ReviewSettings {
  public: boolean;
  listed: boolean;
}

export interface RatingSummary {
  avg: number;
  count: number;
}

function isSubscriptionActive(shop: Shop, now: Date): boolean {
  return now.getTime() < Math.max(shop.trialEndsAt.getTime(), shop.paidUntil?.getTime() ?? 0);
}

/** ينظّف التعليق: يحذف رموز التحكّم والاتّجاه الخفيّة، ويضغط المسافات. */
export function cleanComment(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw new DomainError("review_invalid");
  const s = v
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*(\n\s*)+/g, "\n\n")
    .trim();
  if (!s) return null;
  if ([...s].length > COMMENT_MAX) throw new DomainError("review_too_long");
  return s;
}

function cleanRating(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 5) throw new DomainError("review_invalid");
  return n;
}

// ————————————————————————— الإعدادات —————————————————————————

export async function getReviewSettings(q: Q, shopId: string): Promise<ReviewSettings> {
  const rows = await q.query<{ public: boolean; listed: boolean }>("select public, listed from review_settings where shop_id = $1", [shopId]);
  return rows[0] ? { public: Boolean(rows[0].public), listed: Boolean(rows[0].listed) } : { public: false, listed: false };
}

export async function saveReviewSettings(shop: Shop, body: Record<string, unknown>): Promise<ReviewSettings> {
  if (typeof body.public !== "boolean" || typeof body.listed !== "boolean") throw new DomainError("invalid_settings");
  const db = await getDb();
  await db.query(
    `insert into review_settings (shop_id, public, listed) values ($1, $2, $3)
     on conflict (shop_id) do update set public = excluded.public, listed = excluded.listed`,
    [shop.id, body.public, body.listed],
  );
  return { public: body.public, listed: body.listed };
}

// ————————————————————————— الملخّص —————————————————————————

async function summaries(q: Q, shopIds: string[]): Promise<Map<string, RatingSummary>> {
  const out = new Map<string, RatingSummary>();
  if (!shopIds.length) return out;
  const rows = await q.query<{ shop_id: string; n: number; avg: string | number }>(
    "select shop_id, count(*)::int as n, avg(rating)::float8 as avg from reviews where shop_id = any($1::uuid[]) group by shop_id",
    [shopIds],
  );
  for (const r of rows) out.set(String(r.shop_id), { count: Number(r.n), avg: Math.round(Number(r.avg) * 10) / 10 });
  return out;
}

/** المعدّل كما يراه العموم: فقط إن سمح الطبيب وبلغ العدد 3. */
export async function publicRating(shopId: string): Promise<RatingSummary | null> {
  const db = await getDb();
  const s = await getReviewSettings(db, shopId);
  if (!s.public) return null;
  const r = (await summaries(db, [shopId])).get(shopId);
  return r && r.count >= MIN_PUBLIC_COUNT ? r : null;
}

// ————————————————————————— المريض —————————————————————————

export type ReviewState =
  | { state: "none" } // لا تقييم لهذه التذكرة (لم تُخدم، أو انتهت المهلة)
  | { state: "open"; mapsUrl: string | null; leftH: number }
  | { state: "sent"; rating: number; mapsUrl: string | null };

function windowLeftMs(t: Ticket, now: Date): number {
  if (t.status !== "done") return -1;
  const at = t.doneAt ?? t.closedAt ?? t.calledAt;
  if (!at) return -1;
  return at.getTime() + REVIEW_WINDOW_H * HOUR - now.getTime();
}

export async function reviewState(ticketId: string): Promise<ReviewState> {
  if (!isUuid(ticketId)) throw new DomainError("ticket_not_found", 404);
  const db = await getDb();
  const ticket = await repo.getTicket(db, ticketId);
  if (!ticket) throw new DomainError("ticket_not_found", 404);
  const shop = (await repo.getShopById(db, ticket.shopId))!;
  const rows = await db.query<{ rating: number }>("select rating from reviews where ticket_id = $1", [ticketId]);
  if (rows[0]) return { state: "sent", rating: Number(rows[0].rating), mapsUrl: shop.profile.mapsUrl };
  const now = clockNow();
  const left = windowLeftMs(ticket, now);
  if (left <= 0 || !isSubscriptionActive(shop, now)) return { state: "none" };
  return { state: "open", mapsUrl: shop.profile.mapsUrl, leftH: Math.ceil(left / HOUR) };
}

export async function submitReview(ticketId: string, body: Record<string, unknown>) {
  if (!isUuid(ticketId)) throw new DomainError("ticket_not_found", 404);
  const rating = cleanRating(body.rating);
  const comment = cleanComment(body.comment);
  const db = await getDb();
  const now = clockNow();
  return db.tx(async (q) => {
    // نقفل التذكرة: طلبان متزامنان لنفس التذكرة يمرّان واحداً بعد الآخر
    const rows = await q.query("select * from tickets where id = $1 for update", [ticketId]);
    if (!rows[0]) throw new DomainError("ticket_not_found", 404);
    const ticket = repo.rowToTicket(rows[0]);
    const existing = await q.query<{ rating: number; comment: string | null }>("select rating, comment from reviews where ticket_id = $1", [ticketId]);
    if (existing[0]) {
      // إعادة إرسال نفس التقييم (شبكة ضعيفة) = نجاح؛ تقييم مختلف = مرفوض
      if (Number(existing[0].rating) === rating && (existing[0].comment ?? null) === comment) return { ok: true, rating };
      throw new DomainError("review_exists", 409);
    }
    const shop = (await repo.getShopById(q, ticket.shopId))!;
    if (!isSubscriptionActive(shop, now)) throw new DomainError("subscription", 403);
    if (ticket.status !== "done") throw new DomainError("review_not_allowed", 403);
    if (windowLeftMs(ticket, now) <= 0) throw new DomainError("review_expired", 403);
    const recent = await q.query<{ n: number }>("select count(*)::int as n from reviews where shop_id = $1 and created_at > $2", [
      shop.id,
      new Date(now.getTime() - HOUR),
    ]);
    if (Number(recent[0].n) >= SHOP_HOURLY_CAP) throw new DomainError("review_rate", 429);
    await q.query("insert into reviews (shop_id, ticket_id, rating, comment, created_at) values ($1, $2, $3, $4, $5)", [
      shop.id,
      ticketId,
      rating,
      comment,
      now,
    ]);
    return { ok: true, rating };
  });
}

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// ————————————————————————— الطبيب —————————————————————————

export interface StaffReview {
  id: string;
  rating: number;
  comment: string;
  hidden: boolean;
  createdAt: string;
}

export interface StaffReviews {
  avg: number | null;
  count: number;
  /** dist[0] = عدد 5 نجوم … dist[4] = عدد نجمة واحدة */
  dist: number[];
  comments: StaffReview[];
  settings: ReviewSettings;
}

export async function staffReviews(shop: Shop): Promise<StaffReviews> {
  const db = await getDb();
  const [dist, comments, settings] = await Promise.all([
    db.query<{ rating: number; n: number }>("select rating, count(*)::int as n from reviews where shop_id = $1 group by rating", [shop.id]),
    db.query<Row>(
      `select id, rating, comment, hidden, created_at from reviews
        where shop_id = $1 and comment is not null order by created_at desc limit 20`,
      [shop.id],
    ),
    getReviewSettings(db, shop.id),
  ]);
  const counts = [5, 4, 3, 2, 1].map((s) => Number(dist.find((d) => Number(d.rating) === s)?.n ?? 0));
  const count = counts.reduce((a, b) => a + b, 0);
  const sum = counts.reduce((a, n, i) => a + n * (5 - i), 0);
  return {
    avg: count ? Math.round((sum / count) * 10) / 10 : null,
    count,
    dist: counts,
    settings,
    comments: comments.map((r) => ({
      id: String(r.id),
      rating: Number(r.rating),
      comment: String(r.comment),
      hidden: Boolean(r.hidden),
      createdAt: (r.created_at instanceof Date ? r.created_at : new Date(String(r.created_at))).toISOString(),
    })),
  };
}

/** إخفاء تعليق مسيء (النجوم تبقى في المعدّل: لا يمكن «تنظيف» التقييم). */
export async function setReviewHidden(shop: Shop, id: unknown, hidden: unknown) {
  if (!isUuid(id) || typeof hidden !== "boolean") throw new DomainError("bad_request");
  const db = await getDb();
  const rows = await db.query("update reviews set hidden = $3 where id = $1 and shop_id = $2 returning id", [id, shop.id, hidden]);
  if (!rows.length) throw new DomainError("review_not_found", 404);
  return { ok: true, hidden };
}

// ————————————————————————— الدليل العامّ —————————————————————————

export type LiveStatus = "open" | "break" | "later" | "closed";

export interface DirectoryEntry {
  slug: string;
  name: string;
  kind: ShopKind;
  profile: ShopProfile;
  rating: RatingSummary | null;
  status: LiveStatus;
  /** وقت الافتتاح التالي اليوم (استراحة/قبل الافتتاح) */
  opensAt: string | null;
  waiting: number;
  waitMin: number | null;
}

export const DIRECTORY_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

/** يهرّب % و _ في بحث ILIKE. */
function likePattern(s: string): string {
  return `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function cleanDirectoryQuery(input: { q?: unknown; wilaya?: unknown; page?: unknown }) {
  const q = typeof input.q === "string" ? input.q.replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const w = Number(input.wilaya);
  const p = Math.floor(Number(input.page));
  return {
    q,
    wilaya: isWilaya(w) ? w : null,
    page: Number.isFinite(p) && p >= 1 && p <= 1000 ? p : 1,
  };
}

/**
 * العيادات المسجّلة في الدليل (اشتراك ساري فقط) مع حالتها الحيّة.
 * استعلامان فقط مهما كان عدد العيادات: العيادات + إحصاء تذاكر اليوم لها كلّها.
 */
export async function directory(input: { q?: unknown; wilaya?: unknown; page?: unknown; pageSize?: number }) {
  const { q, wilaya, page } = cleanDirectoryQuery(input);
  const size = Math.min(Math.max(input.pageSize ?? DIRECTORY_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const db = await getDb();
  const now = clockNow();
  const params: unknown[] = [now];
  const where = ["rs.listed", "greatest(s.trial_ends_at, coalesce(s.paid_until, s.trial_ends_at)) > $1"];
  if (wilaya) {
    params.push(wilaya);
    where.push(`s.wilaya = $${params.length}`);
  }
  if (q) {
    params.push(likePattern(q));
    const i = params.length;
    where.push(`(s.name ilike $${i} or s.doctor_name ilike $${i} or s.specialty ilike $${i} or s.address ilike $${i})`);
  }
  const countRows = await db.query<{ n: number }>(
    `select count(*)::int as n from shops s join review_settings rs on rs.shop_id = s.id where ${where.join(" and ")}`,
    params,
  );
  const total = Number(countRows[0]?.n ?? 0);
  params.push(size, (page - 1) * size);
  const shopRows = await db.query<Row>(
    `select s.*, rs.public as rating_public from shops s join review_settings rs on rs.shop_id = s.id
      where ${where.join(" and ")}
      order by s.name, s.id limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  const shops = shopRows.map((r) => ({ shop: repo.rowToShop(r), ratingPublic: Boolean(r.rating_public) }));
  const ids = shops.map((s) => s.shop.id);
  const day = dayKey(now);
  const [live, ratings] = await Promise.all([liveCounts(db, ids, day), summaries(db, ids.filter((_, i) => shops[i].ratingPublic))]);

  const entries: DirectoryEntry[] = shops.map(({ shop, ratingPublic }) => {
    const l = live.get(shop.id);
    const rating = ratingPublic ? ratings.get(shop.id) ?? null : null;
    let status: LiveStatus;
    let opensAt: string | null = null;
    if (l?.closed) status = "closed";
    else if (isWithinHours(shop.hours, now)) status = "open";
    else {
      const next = nextOpeningToday(shop.hours, now);
      opensAt = next?.at ?? null;
      status = next ? (next.afterBreak ? "break" : "later") : "closed";
    }
    const waiting = l?.waiting ?? 0;
    // نفس منطق publicShop: متوسّط اليوم ممزوجاً بالقيمة الافتراضية حتى 3 قياسات
    const def = shop.settings.defaultServiceMin;
    const n = l?.durN ?? 0;
    const k = Math.max(0, 3 - n);
    const avg = ((l?.durSum ?? 0) + def * k) / (n + k);
    const sinceCall = l?.calledAt ? (now.getTime() - l.calledAt.getTime()) / 60000 : null;
    const waitMin =
      status === "closed" ? null : Math.ceil((sinceCall !== null ? Math.max(avg - sinceCall, 1) : 0) + waiting * avg);
    return {
      slug: shop.slug,
      name: shop.name,
      kind: shop.kind,
      profile: shop.profile,
      rating: rating && rating.count >= MIN_PUBLIC_COUNT ? rating : null,
      status,
      opensAt,
      waiting,
      waitMin,
    };
  });
  // داخل الصفحة: من يستقبل الآن أوّلاً
  const rank: Record<LiveStatus, number> = { open: 0, break: 1, later: 2, closed: 3 };
  entries.sort((a, b) => rank[a.status] - rank[b.status]);
  return { entries, total, page, pages: Math.max(1, Math.ceil(total / size)), q, wilaya, day: localTime(now).day };
}

interface Live {
  waiting: number;
  calledAt: Date | null;
  durSum: number;
  durN: number;
  closed: boolean;
}

async function liveCounts(q: Q, shopIds: string[], day: string): Promise<Map<string, Live>> {
  const out = new Map<string, Live>();
  if (!shopIds.length) return out;
  const rows = await q.query<Row>(
    `select t.shop_id,
            count(*) filter (where t.status = 'waiting' and not t.held)::int as waiting,
            max(t.called_at) filter (where t.status = 'called') as called_at,
            coalesce(sum(extract(epoch from (t.done_at - t.called_at)) / 60) filter (
              where t.status = 'done' and t.called_at is not null and t.done_at is not null
                and t.done_at - t.called_at between interval '30 seconds' and interval '180 minutes'), 0)::float8 as dur_sum,
            count(*) filter (
              where t.status = 'done' and t.called_at is not null and t.done_at is not null
                and t.done_at - t.called_at between interval '30 seconds' and interval '180 minutes')::int as dur_n
       from tickets t
      where t.shop_id = any($1::uuid[]) and t.day = $2
      group by t.shop_id`,
    [shopIds, day],
  );
  for (const r of rows) {
    const c = r.called_at;
    out.set(String(r.shop_id), {
      waiting: Number(r.waiting),
      calledAt: c == null ? null : c instanceof Date ? c : new Date(String(c)),
      durSum: Number(r.dur_sum),
      durN: Number(r.dur_n),
      closed: false,
    });
  }
  // يوم مغلق بلا أيّ تذكرة: نقرؤه من queue_days مباشرة
  const closedRows = await q.query<{ shop_id: string }>(
    "select shop_id from queue_days where shop_id = any($1::uuid[]) and day = $2 and closed",
    [shopIds, day],
  );
  for (const r of closedRows) {
    const id = String(r.shop_id);
    const cur = out.get(id);
    if (cur) cur.closed = true;
    else out.set(id, { waiting: 0, calledAt: null, durSum: 0, durN: 0, closed: true });
  }
  return out;
}
