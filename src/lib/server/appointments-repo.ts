/** استعلامات SQL الخاصّة بالمواعيد وإعدادات الحجز. */
import { isValidHours } from "../domain/time";
import type { Lang, WeeklyHours } from "../domain/types";
import { DEFAULT_BOOKING, type Appointment, type ApptSource, type ApptStatus, type BookingSettings, type SlotCount } from "../domain/appointments";
import type { Q, Row } from "./db";

const d = (v: unknown): Date | null => (v == null ? null : v instanceof Date ? v : new Date(String(v)));

export function rowToAppointment(r: Row): Appointment {
  return {
    id: String(r.id),
    shopId: String(r.shop_id),
    day: String(r.day),
    time: String(r.time),
    name: String(r.name),
    phone: r.phone == null ? null : String(r.phone),
    lang: (r.lang === "fr" ? "fr" : "ar") as Lang,
    source: r.source as ApptSource,
    status: r.status as ApptStatus,
    reason: (r.reason as string | null) ?? null,
    ticketId: r.ticket_id == null ? null : String(r.ticket_id),
    createdAt: d(r.created_at)!,
    cancelledAt: d(r.cancelled_at),
    arrivedAt: d(r.arrived_at),
    remindedAt: d(r.reminded_at),
  };
}

function rowToSettings(r: Row | undefined): BookingSettings {
  if (!r) return { ...DEFAULT_BOOKING };
  const hours = typeof r.hours === "string" ? JSON.parse(r.hours) : r.hours;
  return {
    enabled: Boolean(r.enabled),
    slotMin: Number(r.slot_min),
    perSlot: Number(r.per_slot),
    daysAhead: Number(r.days_ahead),
    minLeadMin: Number(r.min_lead_min),
    hours: hours != null && isValidHours(hours) ? (hours as WeeklyHours) : null,
    dailyMax: Number(r.daily_max),
    arrivalGraceMin: Number(r.arrival_grace_min),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

// ——— الإعدادات ———

export async function getSettings(q: Q, shopId: string): Promise<BookingSettings> {
  const rows = await q.query("select * from booking_settings where shop_id = $1", [shopId]);
  return rowToSettings(rows[0]);
}

export async function saveSettings(q: Q, shopId: string, s: BookingSettings, now: Date) {
  await q.query(
    `insert into booking_settings (shop_id, enabled, slot_min, per_slot, days_ahead, min_lead_min, hours, daily_max, arrival_grace_min, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     on conflict (shop_id) do update set enabled = excluded.enabled, slot_min = excluded.slot_min, per_slot = excluded.per_slot,
       days_ahead = excluded.days_ahead, min_lead_min = excluded.min_lead_min, hours = excluded.hours,
       daily_max = excluded.daily_max, arrival_grace_min = excluded.arrival_grace_min, updated_at = excluded.updated_at`,
    [shopId, s.enabled, s.slotMin, s.perSlot, s.daysAhead, s.minLeadMin, s.hours ? JSON.stringify(s.hours) : null, s.dailyMax, s.arrivalGraceMin, now],
  );
}

// ——— المواعيد ———

export async function getAppointment(q: Q, id: string): Promise<Appointment | null> {
  if (!isUuid(id)) return null;
  const rows = await q.query("select * from appointments where id = $1", [id]);
  return rows[0] ? rowToAppointment(rows[0]) : null;
}

/** يقفل صفّ الموعد حتى نهاية المعاملة. */
export async function lockAppointment(q: Q, id: string): Promise<Appointment | null> {
  if (!isUuid(id)) return null;
  const rows = await q.query("select * from appointments where id = $1 for update", [id]);
  return rows[0] ? rowToAppointment(rows[0]) : null;
}

/** عدد المواعيد النشطة (محجوز أو وصل) لكلّ وقت. */
export async function activeCounts(q: Q, shopId: string, fromDay: string, toDay: string): Promise<SlotCount[]> {
  const rows = await q.query<{ day: string; time: string; n: number }>(
    `select day, time, count(*)::int as n from appointments
     where shop_id = $1 and day >= $2 and day <= $3 and status in ('booked', 'arrived')
     group by day, time`,
    [shopId, fromDay, toDay],
  );
  return rows.map((r) => ({ day: String(r.day), time: String(r.time), n: Number(r.n) }));
}

export async function findActiveByPhone(q: Q, shopId: string, day: string, phone: string): Promise<Appointment | null> {
  const rows = await q.query(
    "select * from appointments where shop_id = $1 and day = $2 and phone = $3 and status in ('booked', 'arrived') limit 1",
    [shopId, day, phone],
  );
  return rows[0] ? rowToAppointment(rows[0]) : null;
}

export async function countUpcomingByPhone(q: Q, shopId: string, phone: string, fromDay: string): Promise<number> {
  const rows = await q.query<{ n: number }>(
    "select count(*)::int as n from appointments where shop_id = $1 and phone = $2 and day >= $3 and status = 'booked'",
    [shopId, phone, fromDay],
  );
  return Number(rows[0].n);
}

export async function countRecentOnline(q: Q, shopId: string, since: Date): Promise<number> {
  const rows = await q.query<{ n: number }>(
    "select count(*)::int as n from appointments where shop_id = $1 and source = 'online' and created_at >= $2",
    [shopId, since],
  );
  return Number(rows[0].n);
}

export async function insertAppointment(
  q: Q,
  a: { shopId: string; day: string; time: string; name: string; phone: string | null; lang: Lang; source: ApptSource; reason?: string | null; now: Date },
): Promise<Appointment> {
  const rows = await q.query(
    `insert into appointments (shop_id, day, time, name, phone, lang, source, status, created_at, reason)
     values ($1,$2,$3,$4,$5,$6,$7,'booked',$8,$9) returning *`,
    [a.shopId, a.day, a.time, a.name, a.phone, a.lang, a.source, a.now, a.reason ?? null],
  );
  return rowToAppointment(rows[0]);
}

/** إلغاء مشروط: ينجح فقط إن كان الموعد ما زال محجوزاً. */
export async function cancelAppointment(q: Q, id: string, now: Date): Promise<boolean> {
  const rows = await q.query(
    "update appointments set status = 'cancelled', cancelled_at = $2 where id = $1 and status = 'booked' returning id",
    [id, now],
  );
  return rows.length === 1;
}

export async function markArrived(q: Q, id: string, ticketId: string, now: Date): Promise<boolean> {
  const rows = await q.query(
    `update appointments set status = 'arrived', ticket_id = $2, arrived_at = $3
     where id = $1 and status in ('booked', 'no_show') returning id`,
    [id, ticketId, now],
  );
  // من وصل متأخّراً بعد تسجيله غائباً: نمحو غيابه (سجلّ الغياب يحمل معرّف الموعد)
  if (rows.length) await q.query("delete from no_shows where ticket_id = $1", [id]);
  return rows.length === 1;
}

/** يُرجع true إن تحوّل الآن إلى «غائب» (مرّة واحدة فقط). */
export async function markNoShow(q: Q, id: string): Promise<boolean> {
  const rows = await q.query("update appointments set status = 'no_show' where id = $1 and status = 'booked' returning id", [id]);
  return rows.length === 1;
}

/** المواعيد المحجوزة حتى اليوم (مرشّحة للغياب) مع مهلة كلّ عيادة. */
export async function listBookedUntil(q: Q, day: string, shopId: string | null, apptId: string | null) {
  const rows = await q.query(
    `select a.*, coalesce(b.arrival_grace_min, $4::int) as grace
     from appointments a left join booking_settings b on b.shop_id = a.shop_id
     where a.status = 'booked' and a.day <= $1
       and ($2::uuid is null or a.shop_id = $2::uuid)
       and ($3::uuid is null or a.id = $3::uuid)
     order by a.day, a.time limit 5000`,
    [day, shopId, apptId, DEFAULT_BOOKING.arrivalGraceMin],
  );
  return rows.map((r) => ({ appt: rowToAppointment(r), grace: Number(r.grace) }));
}

/** آخر يوم فيه موعد محجوز (قد يتجاوز مدّة الحجز الحالية إن قصّرها الطبيب بعد الحجز). */
export async function lastBookedDay(q: Q, shopId: string, fromDay: string): Promise<string | null> {
  const rows = await q.query<{ d: string | null }>("select max(day) as d from appointments where shop_id = $1 and day >= $2 and status = 'booked'", [
    shopId,
    fromDay,
  ]);
  return rows[0]?.d ?? null;
}

export interface StaffApptRow extends Appointment {
  ticketNumber: number | null;
}

export async function listRange(q: Q, shopId: string, fromDay: string, toDay: string): Promise<StaffApptRow[]> {
  const rows = await q.query(
    `select a.*, t.number as ticket_number from appointments a
     left join tickets t on t.id = a.ticket_id
     where a.shop_id = $1 and a.day >= $2 and a.day <= $3
     order by a.day, a.time, a.created_at limit 3000`,
    [shopId, fromDay, toDay],
  );
  return rows.map((r) => ({ ...rowToAppointment(r), ticketNumber: r.ticket_number == null ? null : Number(r.ticket_number) }));
}

/** تذكرة صاحب الموعد تتقدّم الطابور، مرتّبةً بين أصحاب المواعيد بلحظة وصوله (priority_at). */
export async function setTicketPriority(q: Q, ticketId: string, now: Date) {
  // أولوية ممنوحة الآن (حتى لتذكرة عادية أُخذت صباحاً)؛ إن كانت ذات أولوية من قبل نُبقي لحظتها الأولى
  await q.query(
    "update tickets set priority_at = case when priority then coalesce(priority_at, $2) else $2 end, priority = true where id = $1",
    [ticketId, now],
  );
}

export async function insertApptNoShow(q: Q, shopId: string, phone: string, apptId: string, now: Date) {
  // ticket_id في سجلّ الغياب = معرّف الموعد (يُمحى إن وصل متأخّراً)
  await q.query("insert into no_shows (shop_id, phone, ticket_id, created_at) values ($1,$2,$3,$4)", [shopId, phone, apptId, now]);
}

/** يمحو الاسم والهاتف من المواعيد التي مضى على تاريخها 30 يوماً. */
export async function anonymizeBefore(q: Q, day: string): Promise<number> {
  const rows = await q.query(
    "update appointments set name = '—', phone = null, reason = null where day < $1 and (phone is not null or name <> '—' or reason is not null) returning id",
    [day],
  );
  return rows.length;
}

export async function claimCode(q: Q, codeId: number, now: Date): Promise<boolean> {
  const rows = await q.query("update phone_codes set used_at = $2 where id = $1 and used_at is null returning id", [codeId, now]);
  return rows.length === 1;
}
