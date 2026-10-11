/** استعلامات SQL وتحويل الصفوف إلى أنواع المجال. */
import {
  DEFAULT_SETTINGS,
  OPEN_STATUSES,
  type Lang,
  type Shop,
  type ShopSettings,
  type Ticket,
  type TicketPatch,
  type TicketStatus,
} from "../domain/types";
import type { Q, Row } from "./db";

const d = (v: unknown): Date | null => (v == null ? null : v instanceof Date ? v : new Date(String(v)));

function json<T>(v: unknown): T {
  return (typeof v === "string" ? JSON.parse(v) : v) as T;
}

export function rowToShop(r: Row): Shop {
  return {
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    kind: r.kind as Shop["kind"],
    pinHash: String(r.pin_hash),
    doorCode: String(r.door_code),
    hours: json(r.hours),
    settings: { ...DEFAULT_SETTINGS, ...json<Partial<ShopSettings>>(r.settings ?? {}) },
    defaultLang: r.default_lang as Lang,
    trialEndsAt: d(r.trial_ends_at)!,
    paidUntil: d(r.paid_until),
    failedLogins: Number(r.failed_logins),
    lockedUntil: d(r.locked_until),
    sessionVersion: Number(r.session_version),
    createdAt: d(r.created_at)!,
  };
}

export function rowToTicket(r: Row): Ticket {
  return {
    id: String(r.id),
    shopId: String(r.shop_id),
    day: String(r.day),
    number: Number(r.number),
    name: String(r.name),
    phone: r.phone == null ? null : String(r.phone),
    lang: r.lang as Lang,
    source: r.source as Ticket["source"],
    status: r.status as TicketStatus,
    held: Boolean(r.held),
    createdAt: d(r.created_at)!,
    calledAt: d(r.called_at),
    doneAt: d(r.done_at),
    deferredAt: d(r.deferred_at),
    arrivedAt: d(r.arrived_at),
    confirmAskedAt: d(r.confirm_asked_at),
    confirmedAt: d(r.confirmed_at),
    notifiedSoonAt: d(r.notified_soon_at),
    closedAt: d(r.closed_at),
  };
}

const PATCH_COLUMNS: Record<keyof TicketPatch, string> = {
  status: "status",
  held: "held",
  calledAt: "called_at",
  doneAt: "done_at",
  deferredAt: "deferred_at",
  arrivedAt: "arrived_at",
  confirmAskedAt: "confirm_asked_at",
  confirmedAt: "confirmed_at",
  notifiedSoonAt: "notified_soon_at",
  closedAt: "closed_at",
};

// ——— المحلّات ———

export async function getShopBySlug(q: Q, slug: string): Promise<Shop | null> {
  const rows = await q.query("select * from shops where slug = $1", [slug]);
  return rows[0] ? rowToShop(rows[0]) : null;
}

export async function getShopById(q: Q, id: string): Promise<Shop | null> {
  const rows = await q.query("select * from shops where id = $1", [id]);
  return rows[0] ? rowToShop(rows[0]) : null;
}

export async function insertShop(
  q: Q,
  s: Pick<Shop, "slug" | "name" | "kind" | "pinHash" | "doorCode" | "hours" | "settings" | "defaultLang" | "trialEndsAt">,
): Promise<Shop> {
  const rows = await q.query(
    `insert into shops (slug, name, kind, pin_hash, door_code, hours, settings, default_lang, trial_ends_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
    [s.slug, s.name, s.kind, s.pinHash, s.doorCode, JSON.stringify(s.hours), JSON.stringify(s.settings), s.defaultLang, s.trialEndsAt],
  );
  return rowToShop(rows[0]);
}

export async function updateShop(
  q: Q,
  id: string,
  patch: Partial<Pick<Shop, "name" | "hours" | "settings" | "defaultLang" | "pinHash" | "doorCode">> & {
    bumpSession?: boolean;
  },
) {
  const sets: string[] = [];
  const params: unknown[] = [];
  const set = (col: string, v: unknown) => {
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  };
  if (patch.name !== undefined) set("name", patch.name);
  if (patch.hours !== undefined) set("hours", JSON.stringify(patch.hours));
  if (patch.settings !== undefined) set("settings", JSON.stringify(patch.settings));
  if (patch.defaultLang !== undefined) set("default_lang", patch.defaultLang);
  if (patch.pinHash !== undefined) set("pin_hash", patch.pinHash);
  if (patch.doorCode !== undefined) set("door_code", patch.doorCode);
  if (patch.bumpSession) sets.push("session_version = session_version + 1");
  if (!sets.length) return;
  params.push(id);
  await q.query(`update shops set ${sets.join(", ")} where id = $${params.length}`, params);
}

export async function recordLoginResult(q: Q, shopId: string, ok: boolean, now: Date) {
  if (ok) {
    await q.query("update shops set failed_logins = 0, locked_until = null where id = $1", [shopId]);
  } else {
    // بعد 5 محاولات خاطئة: قفل 15 دقيقة
    await q.query(
      `update shops set failed_logins = failed_logins + 1,
         locked_until = case when failed_logins + 1 >= 5 then $2::timestamptz else locked_until end
       where id = $1`,
      [shopId, new Date(now.getTime() + 15 * 60000)],
    );
    await q.query("update shops set failed_logins = 0 where id = $1 and failed_logins >= 5", [shopId]);
  }
}

// ——— أيّام الطابور ———

export interface QueueDay {
  lastNumber: number;
  closed: boolean;
}

/** يُنشئ صفّ اليوم إن لم يوجد ويقفله حتى نهاية المعاملة. */
export async function lockDay(q: Q, shopId: string, day: string): Promise<QueueDay> {
  await q.query("insert into queue_days (shop_id, day) values ($1, $2) on conflict do nothing", [shopId, day]);
  const rows = await q.query<{ last_number: number; closed: boolean }>(
    "select last_number, closed from queue_days where shop_id = $1 and day = $2 for update",
    [shopId, day],
  );
  return { lastNumber: Number(rows[0].last_number), closed: Boolean(rows[0].closed) };
}

export async function getDay(q: Q, shopId: string, day: string): Promise<QueueDay> {
  const rows = await q.query<{ last_number: number; closed: boolean }>(
    "select last_number, closed from queue_days where shop_id = $1 and day = $2",
    [shopId, day],
  );
  return rows[0]
    ? { lastNumber: Number(rows[0].last_number), closed: Boolean(rows[0].closed) }
    : { lastNumber: 0, closed: false };
}

export async function setDayClosed(q: Q, shopId: string, day: string, closed: boolean) {
  await q.query("update queue_days set closed = $3 where shop_id = $1 and day = $2", [shopId, day, closed]);
}

export async function allocateNumber(q: Q, shopId: string, day: string): Promise<number> {
  const rows = await q.query<{ last_number: number }>(
    "update queue_days set last_number = last_number + 1 where shop_id = $1 and day = $2 returning last_number",
    [shopId, day],
  );
  return Number(rows[0].last_number);
}

// ——— التذاكر ———

export async function listDayTickets(q: Q, shopId: string, day: string): Promise<Ticket[]> {
  const rows = await q.query("select * from tickets where shop_id = $1 and day = $2 order by number", [shopId, day]);
  return rows.map(rowToTicket);
}

export async function listStaleOpenTickets(q: Q, shopId: string | null, day: string): Promise<Ticket[]> {
  const rows = await q.query(
    `select * from tickets where day < $1 and status = any($2::text[])
       and ($3::uuid is null or shop_id = $3::uuid)
     order by shop_id, day, number limit 2000`,
    [day, OPEN_STATUSES, shopId],
  );
  return rows.map(rowToTicket);
}

export async function getTicket(q: Q, id: string): Promise<Ticket | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await q.query("select * from tickets where id = $1", [id]);
  return rows[0] ? rowToTicket(rows[0]) : null;
}

export async function findTicketByPhone(q: Q, shopId: string, day: string, phone: string): Promise<Ticket | null> {
  const rows = await q.query("select * from tickets where shop_id = $1 and day = $2 and phone = $3", [
    shopId,
    day,
    phone,
  ]);
  return rows[0] ? rowToTicket(rows[0]) : null;
}

export async function insertTicket(
  q: Q,
  t: Omit<Ticket, "id" | "calledAt" | "doneAt" | "deferredAt" | "closedAt" | "held" | "confirmAskedAt"> &
    Partial<Ticket>,
): Promise<Ticket> {
  const rows = await q.query(
    `insert into tickets (shop_id, day, number, name, phone, lang, source, status, created_at,
                          arrived_at, confirmed_at, notified_soon_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
    [
      t.shopId,
      t.day,
      t.number,
      t.name,
      t.phone,
      t.lang,
      t.source,
      t.status,
      t.createdAt,
      t.arrivedAt ?? null,
      t.confirmedAt ?? null,
      t.notifiedSoonAt ?? null,
    ],
  );
  return rowToTicket(rows[0]);
}

/** تحديث مشروط بالحالة المتوقَّعة: يُرجع false إن تغيّرت التذكرة في الأثناء. */
export async function updateTicket(q: Q, id: string, expect: TicketStatus[], patch: TicketPatch): Promise<boolean> {
  const sets: string[] = [];
  const params: unknown[] = [id, expect];
  for (const [k, v] of Object.entries(patch)) {
    params.push(v);
    sets.push(`${PATCH_COLUMNS[k as keyof TicketPatch]} = $${params.length}`);
  }
  if (!sets.length) return true;
  const rows = await q.query(
    `update tickets set ${sets.join(", ")} where id = $1 and status = any($2::text[]) returning id`,
    params,
  );
  return rows.length === 1;
}

// ——— الغياب ———

export async function countNoShows(q: Q, shopId: string, phone: string, since: Date): Promise<number> {
  const rows = await q.query<{ n: number }>(
    "select count(*)::int as n from no_shows where shop_id = $1 and phone = $2 and created_at >= $3",
    [shopId, phone, since],
  );
  return Number(rows[0].n);
}

export async function insertNoShow(q: Q, shopId: string, phone: string, ticketId: string, now: Date) {
  await q.query("insert into no_shows (shop_id, phone, ticket_id, created_at) values ($1,$2,$3,$4)", [
    shopId,
    phone,
    ticketId,
    now,
  ]);
}

export async function purgeOld(q: Q, noShowsBefore: Date, codesBefore: Date) {
  const a = await q.query("delete from no_shows where created_at < $1 returning id", [noShowsBefore]);
  const b = await q.query("delete from phone_codes where created_at < $1 returning id", [codesBefore]);
  return { noShows: a.length, codes: b.length };
}

// ——— رموز التحقّق ———

export async function countRecentCodes(q: Q, shopId: string, phone: string | null, since: Date): Promise<number> {
  const rows = await q.query<{ n: number }>(
    `select count(*)::int as n from phone_codes
     where shop_id = $1 and ($2::text is null or phone = $2::text) and created_at >= $3`,
    [shopId, phone, since],
  );
  return Number(rows[0].n);
}

export async function insertCode(q: Q, shopId: string, phone: string, codeHash: string, now: Date, expires: Date) {
  await q.query(
    "insert into phone_codes (shop_id, phone, code_hash, created_at, expires_at) values ($1,$2,$3,$4,$5)",
    [shopId, phone, codeHash, now, expires],
  );
}

export async function latestCode(q: Q, shopId: string, phone: string, now: Date) {
  const rows = await q.query<{ id: number; code_hash: string; attempts: number }>(
    `select id, code_hash, attempts from phone_codes
     where shop_id = $1 and phone = $2 and used_at is null and expires_at > $3
     order by created_at desc, id desc limit 1`,
    [shopId, phone, now],
  );
  return rows[0] ?? null;
}

export async function markCodeAttempt(q: Q, id: number, used: boolean, now: Date) {
  if (used) await q.query("update phone_codes set used_at = $2 where id = $1", [id, now]);
  else await q.query("update phone_codes set attempts = attempts + 1 where id = $1", [id]);
}

// ——— الإشعارات ———

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function savePushSub(q: Q, ticketId: string, s: PushSub) {
  await q.query(
    `insert into push_subscriptions (ticket_id, endpoint, p256dh, auth) values ($1,$2,$3,$4)
     on conflict (ticket_id) do update set endpoint = excluded.endpoint, p256dh = excluded.p256dh, auth = excluded.auth`,
    [ticketId, s.endpoint, s.p256dh, s.auth],
  );
}

export async function getPushSub(q: Q, ticketId: string): Promise<PushSub | null> {
  const rows = await q.query<PushSub>("select endpoint, p256dh, auth from push_subscriptions where ticket_id = $1", [
    ticketId,
  ]);
  return rows[0] ?? null;
}

export async function deletePushSub(q: Q, ticketId: string) {
  await q.query("delete from push_subscriptions where ticket_id = $1", [ticketId]);
}

// ——— الإحصاءات ———

export interface DailyRow {
  day: string;
  total: number;
  served: number;
  noShows: number;
  avgWaitMin: number | null;
}

export async function dailyStats(q: Q, shopId: string, fromDay: string): Promise<DailyRow[]> {
  const rows = await q.query<{ day: string; total: number; served: number; no_shows: number; avg_wait: number | null }>(
    `select day,
            count(*)::int as total,
            count(*) filter (where status = 'done')::int as served,
            count(*) filter (where status = 'no_show')::int as no_shows,
            round(avg(extract(epoch from (called_at - created_at)) / 60)
                  filter (where called_at is not null))::int as avg_wait
     from tickets where shop_id = $1 and day >= $2
     group by day order by day desc`,
    [shopId, fromDay],
  );
  return rows.map((r) => ({
    day: r.day,
    total: Number(r.total),
    served: Number(r.served),
    noShows: Number(r.no_shows),
    avgWaitMin: r.avg_wait == null ? null : Number(r.avg_wait),
  }));
}
