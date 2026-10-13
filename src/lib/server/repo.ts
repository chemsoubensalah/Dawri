/** استعلامات SQL وتحويل الصفوف إلى أنواع المجال. */
import {
  DEFAULT_SETTINGS,
  OPEN_STATUSES,
  readLook,
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
    profile: {
      doctorName: (r.doctor_name as string | null) ?? null,
      specialty: (r.specialty as string | null) ?? null,
      address: (r.address as string | null) ?? null,
      phone: (r.phone as string | null) ?? null,
      mapsUrl: (r.maps_url as string | null) ?? null,
    },
    look: readLook(r.look == null ? {} : json(r.look)),
    ownerEmail: (r.owner_email as string | null) ?? null,
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
    priority: Boolean(r.priority),
    createdAt: d(r.created_at)!,
    calledAt: d(r.called_at),
    doneAt: d(r.done_at),
    deferredAt: d(r.deferred_at),
    arrivedAt: d(r.arrived_at),
    confirmAskedAt: d(r.confirm_asked_at),
    confirmedAt: d(r.confirmed_at),
    notifiedSoonAt: d(r.notified_soon_at),
    closedAt: d(r.closed_at),
    waCode: (r.wa_code as string | null) ?? null,
    waUserId: (r.wa_user_id as string | null) ?? null,
    waPhone: (r.wa_phone as string | null) ?? null,
    waWindowUntil: d(r.wa_window_until),
    waOptOut: Boolean(r.wa_opt_out),
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
  s: Pick<Shop, "slug" | "name" | "kind" | "pinHash" | "doorCode" | "hours" | "settings" | "defaultLang" | "trialEndsAt"> & {
    ownerEmail?: string | null;
  },
): Promise<Shop> {
  const rows = await q.query(
    `insert into shops (slug, name, kind, pin_hash, door_code, hours, settings, default_lang, trial_ends_at, owner_email)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
    [s.slug, s.name, s.kind, s.pinHash, s.doorCode, JSON.stringify(s.hours), JSON.stringify(s.settings), s.defaultLang, s.trialEndsAt, s.ownerEmail ?? null],
  );
  return rowToShop(rows[0]);
}

export async function updateShop(
  q: Q,
  id: string,
  patch: Partial<Pick<Shop, "name" | "hours" | "settings" | "defaultLang" | "pinHash" | "doorCode" | "profile" | "look" | "ownerEmail">> & {
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
  if (patch.profile !== undefined) {
    set("doctor_name", patch.profile.doctorName);
    set("specialty", patch.profile.specialty);
    set("address", patch.profile.address);
    set("phone", patch.profile.phone);
    set("maps_url", patch.profile.mapsUrl);
  }
  if (patch.look !== undefined) set("look", JSON.stringify(patch.look));
  if (patch.ownerEmail !== undefined) set("owner_email", patch.ownerEmail);
  if (patch.bumpSession) sets.push("session_version = session_version + 1");
  if (!sets.length) return;
  params.push(id);
  await q.query(`update shops set ${sets.join(", ")} where id = $${params.length}`, params);
}

/**
 * يحجز محاولة دخول: يزيد العدّاد ذرّياً، ويقفل 15 دقيقة عند الخامسة.
 * يُرجع false إن كان الحساب مقفلاً (فلا تُفحص كلمة السرّ أصلاً).
 */
export async function claimLoginAttempt(q: Q, shopId: string, now: Date): Promise<boolean> {
  const rows = await q.query(
    `update shops
        set failed_logins = case when locked_until is not null and locked_until <= $2 then 1 else failed_logins + 1 end,
            locked_until = case
              when (case when locked_until is not null and locked_until <= $2 then 1 else failed_logins + 1 end) >= 5 then $3::timestamptz
              when locked_until is not null and locked_until <= $2 then null
              else locked_until end
      where id = $1 and (locked_until is null or locked_until <= $2 or failed_logins < 5)
      returning failed_logins`,
    [shopId, now, new Date(now.getTime() + 15 * 60000)],
  );
  return rows.length === 1 && Number((rows[0] as { failed_logins: number }).failed_logins) <= 5;
}

export async function resetLoginAttempts(q: Q, shopId: string) {
  await q.query("update shops set failed_logins = 0, locked_until = null where id = $1", [shopId]);
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
  t: Omit<
    Ticket,
    | "id"
    | "calledAt"
    | "doneAt"
    | "deferredAt"
    | "closedAt"
    | "held"
    | "confirmAskedAt"
    | "waCode"
    | "waUserId"
    | "waPhone"
    | "waWindowUntil"
    | "waOptOut"
  > &
    Partial<Ticket>,
): Promise<Ticket> {
  const rows = await q.query(
    `insert into tickets (shop_id, day, number, name, phone, lang, source, status, created_at,
                          arrived_at, confirmed_at, notified_soon_at, wa_code)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
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
      t.waCode ?? null,
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

export async function purgeOld(q: Q, noShowsBefore: Date, codesBefore: Date, ticketsBefore?: Date) {
  const a = await q.query("delete from no_shows where created_at < $1 returning id", [noShowsBefore]);
  const b = await q.query("delete from phone_codes where created_at < $1 returning id", [codesBefore]);
  let anonymized = 0;
  if (ticketsBefore) {
    // التذاكر القديمة: نُبقي الأرقام للإحصاءات ونمحو الاسم والهاتف
    await q.query("delete from push_subscriptions where ticket_id in (select id from tickets where created_at < $1)", [ticketsBefore]);
    const c = await q.query(
      "update tickets set name = '—', phone = null where created_at < $1 and (phone is not null or name <> '—') returning id",
      [ticketsBefore],
    );
    anonymized = c.length;
  }
  return { noShows: a.length, codes: b.length, anonymized };
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

export async function hourlyCounts(q: Q, shopId: string, since: Date): Promise<{ hour: number; n: number }[]> {
  // الجزائر = UTC+1 طوال السنة (بلا توقيت صيفي)
  const rows = await q.query<{ h: number; n: number }>(
    `select extract(hour from (created_at at time zone 'UTC') + interval '1 hour')::int as h, count(*)::int as n
     from tickets where shop_id = $1 and created_at >= $2 group by h order by h`,
    [shopId, since],
  );
  return rows.map((r) => ({ hour: Number(r.h), n: Number(r.n) }));
}

export async function periodTotals(q: Q, shopId: string, fromDay: string) {
  const rows = await q.query<{
    total: number;
    served: number;
    no_shows: number;
    avg_wait: number | null;
    avg_service: number | null;
    days: number;
  }>(
    `select count(*)::int as total,
            count(*) filter (where status = 'done')::int as served,
            count(*) filter (where status = 'no_show')::int as no_shows,
            round(avg(extract(epoch from (called_at - created_at)) / 60) filter (where called_at is not null))::int as avg_wait,
            round(avg(extract(epoch from (done_at - called_at)) / 60) filter (where done_at is not null and called_at is not null))::int as avg_service,
            count(distinct day)::int as days
     from tickets where shop_id = $1 and day >= $2`,
    [shopId, fromDay],
  );
  const r = rows[0];
  return {
    total: Number(r.total),
    served: Number(r.served),
    noShows: Number(r.no_shows),
    avgWaitMin: r.avg_wait == null ? null : Number(r.avg_wait),
    avgServiceMin: r.avg_service == null ? null : Number(r.avg_service),
    days: Number(r.days),
  };
}

// ——— واتساب ———

export async function waLinkTicket(
  q: Q,
  ticketId: string,
  w: { userId: string | null; phone: string | null; windowUntil: Date },
) {
  await q.query(
    `update tickets set wa_user_id = coalesce($2, wa_user_id), wa_phone = coalesce($3, wa_phone),
       wa_window_until = greatest(coalesce(wa_window_until, $4), $4), wa_opt_out = false
     where id = $1`,
    [ticketId, w.userId, w.phone, w.windowUntil],
  );
}

/** كلّ رسالة من المريض تجدّد نافذة الـ24 ساعة لتذاكره المفتوحة. */
export async function waTouchUser(q: Q, w: { userId: string | null; phone: string | null }, windowUntil: Date, sinceDay: string) {
  if (!w.userId && !w.phone) return;
  await q.query(
    `update tickets set wa_window_until = greatest(coalesce(wa_window_until, $3), $3)
     where day >= $4 and ((wa_user_id is not null and wa_user_id = $1) or (wa_phone is not null and wa_phone = $2))`,
    [w.userId, w.phone, windowUntil, sinceDay],
  );
}

export async function waOptOut(q: Q, w: { userId: string | null; phone: string | null }, sinceDay: string) {
  const rows = await q.query(
    `update tickets set wa_opt_out = true
     where day >= $3 and ((wa_user_id is not null and wa_user_id = $1) or (wa_phone is not null and wa_phone = $2))
     returning id`,
    [w.userId, w.phone, sinceDay],
  );
  return rows.length;
}

export async function findTicketByWaCode(q: Q, day: string, code: string): Promise<Ticket | null> {
  const rows = await q.query("select * from tickets where day = $1 and wa_code = $2", [day, code]);
  return rows[0] ? rowToTicket(rows[0]) : null;
}

/** يسجّل الرسالة الواردة؛ يُرجع false إن عولجت من قبل. */
export async function waMarkInbound(q: Q, id: string): Promise<boolean> {
  const rows = await q.query("insert into wa_inbound (id) values ($1) on conflict do nothing returning id", [id]);
  return rows.length === 1;
}

export interface WaVerification {
  id: string;
  shopId: string;
  code: string;
  name: string;
  phone: string;
  lang: string;
  atDoor: boolean;
  expiresAt: Date;
  verifiedAt: Date | null;
  ticketId: string | null;
  failedReason: string | null;
}

function rowToVerification(r: Row): WaVerification {
  return {
    id: String(r.id),
    shopId: String(r.shop_id),
    code: String(r.code),
    name: String(r.name),
    phone: String(r.phone),
    lang: String(r.lang),
    atDoor: Boolean(r.at_door),
    expiresAt: d(r.expires_at)!,
    verifiedAt: d(r.verified_at),
    ticketId: r.ticket_id == null ? null : String(r.ticket_id),
    failedReason: r.failed_reason == null ? null : String(r.failed_reason),
  };
}

export async function insertWaVerification(
  q: Q,
  v: { shopId: string; code: string; name: string; phone: string; lang: string; atDoor: boolean; now: Date; expiresAt: Date },
): Promise<WaVerification> {
  const rows = await q.query(
    `insert into wa_verifications (shop_id, code, name, phone, lang, at_door, created_at, expires_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [v.shopId, v.code, v.name, v.phone, v.lang, v.atDoor, v.now, v.expiresAt],
  );
  return rowToVerification(rows[0]);
}

export async function getWaVerification(q: Q, id: string): Promise<WaVerification | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await q.query("select * from wa_verifications where id = $1", [id]);
  return rows[0] ? rowToVerification(rows[0]) : null;
}

export async function getWaVerificationByCode(q: Q, code: string): Promise<WaVerification | null> {
  const rows = await q.query("select * from wa_verifications where code = $1", [code]);
  return rows[0] ? rowToVerification(rows[0]) : null;
}

export async function completeWaVerification(q: Q, id: string, ticketId: string, now: Date) {
  await q.query("update wa_verifications set verified_at = $2, ticket_id = $3 where id = $1", [id, now, ticketId]);
}

export async function failWaVerification(q: Q, id: string, reason: string) {
  await q.query("update wa_verifications set failed_reason = $2 where id = $1 and ticket_id is null", [id, reason]);
}

export async function expireStalePayments(q: Q, before: Date) {
  const rows = await q.query("update payments set status = 'failed' where status = 'pending' and created_at < $1 returning id", [before]);
  return rows.length;
}

export async function countRecentWaVerifications(q: Q, shopId: string, phone: string, since: Date): Promise<number> {
  const rows = await q.query<{ n: number }>(
    "select count(*)::int as n from wa_verifications where shop_id = $1 and phone = $2 and created_at >= $3",
    [shopId, phone, since],
  );
  return Number(rows[0].n);
}

export async function purgeWa(q: Q, before: Date) {
  await q.query("delete from wa_verifications where created_at < $1", [before]);
  await q.query("delete from wa_inbound where created_at < $1", [before]);
}

// ——— المدفوعات ———

export interface Payment {
  id: number;
  provider: "chargily" | "manual";
  checkoutId: string | null;
  amount: number;
  months: number;
  status: "pending" | "paid" | "failed";
  note: string | null;
  createdAt: Date;
  paidAt: Date | null;
}

function rowToPayment(r: Row): Payment {
  return {
    id: Number(r.id),
    provider: r.provider as Payment["provider"],
    checkoutId: r.checkout_id == null ? null : String(r.checkout_id),
    amount: Number(r.amount),
    months: Number(r.months),
    status: r.status as Payment["status"],
    note: r.note == null ? null : String(r.note),
    createdAt: d(r.created_at)!,
    paidAt: d(r.paid_at),
  };
}

export async function insertPayment(
  q: Q,
  p: { shopId: string; provider: Payment["provider"]; checkoutId: string | null; amount: number; months: number; status: Payment["status"]; note?: string | null; now: Date },
) {
  const rows = await q.query(
    `insert into payments (shop_id, provider, checkout_id, amount, months, status, note, created_at, paid_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8, case when $6 = 'paid' then $8::timestamptz else null end) returning *`,
    [p.shopId, p.provider, p.checkoutId, p.amount, p.months, p.status, p.note ?? null, p.now],
  );
  return rowToPayment(rows[0]);
}

/** يعلّم الدفع «مدفوعاً» مرّة واحدة فقط؛ يُرجع الصفّ إن تغيّر الآن. */
export async function markPaymentPaid(q: Q, checkoutId: string, now: Date): Promise<(Payment & { shopId: string }) | null> {
  const rows = await q.query(
    "update payments set status = 'paid', paid_at = $2 where checkout_id = $1 and status <> 'paid' returning *",
    [checkoutId, now],
  );
  return rows[0] ? { ...rowToPayment(rows[0]), shopId: String(rows[0].shop_id) } : null;
}

export async function markPaymentFailed(q: Q, checkoutId: string) {
  await q.query("update payments set status = 'failed' where checkout_id = $1 and status = 'pending'", [checkoutId]);
}

export async function listPayments(q: Q, shopId: string): Promise<Payment[]> {
  const rows = await q.query("select * from payments where shop_id = $1 order by created_at desc limit 24", [shopId]);
  return rows.map(rowToPayment);
}

/** يمدّد الاشتراك: من الأبعد بين (الآن، نهاية التجربة، نهاية الاشتراك الحالي). */
export async function extendSubscription(q: Q, shopId: string, months: number, now: Date) {
  const rows = await q.query<{ paid_until: Date }>(
    `update shops set paid_until = greatest($2::timestamptz, trial_ends_at, coalesce(paid_until, $2::timestamptz))
                                  + make_interval(months => $3)
     where id = $1 returning paid_until`,
    [shopId, now, months],
  );
  return rows[0] ? d(rows[0].paid_until) : null;
}

export async function listShopsAdmin(q: Q, since: Date) {
  const rows = await q.query(
    `select s.*, (select count(*)::int from tickets t where t.shop_id = s.id and t.created_at >= $1) as tickets_30d
     from shops s order by s.created_at desc limit 500`,
    [since],
  );
  return rows.map((r) => ({ ...rowToShop(r), tickets30d: Number(r.tickets_30d) }));
}

// ————————————————————————— استعادة الرمز السرّي —————————————————————————

export async function countRecentPinResets(q: Q, shopId: string, since: Date): Promise<number> {
  const rows = await q.query<{ n: string }>("select count(*) as n from pin_resets where shop_id = $1 and created_at > $2", [shopId, since]);
  return Number(rows[0]?.n ?? 0);
}

export async function insertPinReset(q: Q, shopId: string, tokenHash: string, now: Date, expires: Date) {
  await q.query("insert into pin_resets (shop_id, token_hash, created_at, expires_at) values ($1,$2,$3,$4)", [shopId, tokenHash, now, expires]);
}

/** يستهلك الرابط ذرّياً: ينجح مرّة واحدة فقط، قبل انتهاء صلاحيته. */
export async function consumePinReset(q: Q, shopId: string, tokenHash: string, now: Date): Promise<boolean> {
  const rows = await q.query(
    `update pin_resets set used_at = $3
     where shop_id = $1 and token_hash = $2 and used_at is null and expires_at > $3
     returning id`,
    [shopId, tokenHash, now],
  );
  return rows.length > 0;
}

/** يُبطل كلّ الروابط الأخرى غير المستعملة (بعد تغيير الرمز). */
export async function voidPinResets(q: Q, shopId: string, now: Date) {
  await q.query("update pin_resets set used_at = $2 where shop_id = $1 and used_at is null", [shopId, now]);
}
