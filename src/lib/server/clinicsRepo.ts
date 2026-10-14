/**
 * SQL الخاصّ بالعيادات متعدّدة الأطبّاء وأدوار الطبيب/السكرتيرة (010_clinics_roles).
 */
import { readLook, type ShopLook } from "../domain/types";
import type { Q, Row } from "./db";
import { realPaymentCoversSql, rowToPayment, rowToShop, SHOP_COLS, SHOP_FROM, type Payment } from "./repo";
import type { Shop } from "../domain/types";

export interface Clinic {
  id: string;
  slug: string;
  name: string;
  ownerEmail: string | null;
  pinHash: string;
  sessionVersion: number;
  failedLogins: number;
  lockedUntil: Date | null;
  look: ShopLook;
  createdAt: Date;
  /** اشتراك العيادة (014_clinic_billing): يغطّي كلّ أطبّائها */
  trialEndsAt: Date;
  paidUntil: Date | null;
}

const d = (v: unknown) => (v == null ? null : v instanceof Date ? v : new Date(String(v)));
const j = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);

export function rowToClinic(r: Row): Clinic {
  return {
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    ownerEmail: (r.owner_email as string | null) ?? null,
    pinHash: String(r.pin_hash),
    sessionVersion: Number(r.session_version),
    failedLogins: Number(r.failed_logins),
    lockedUntil: d(r.locked_until),
    look: readLook(r.look == null ? {} : j(r.look)),
    createdAt: d(r.created_at)!,
    trialEndsAt: d(r.trial_ends_at)!,
    paidUntil: d(r.paid_until),
  };
}

export async function getClinicBySlug(q: Q, slug: string): Promise<Clinic | null> {
  const rows = await q.query("select * from clinics where slug = $1", [slug]);
  return rows[0] ? rowToClinic(rows[0]) : null;
}

export async function getClinicById(q: Q, id: string): Promise<Clinic | null> {
  const rows = await q.query("select * from clinics where id = $1", [id]);
  return rows[0] ? rowToClinic(rows[0]) : null;
}

export async function insertClinic(
  q: Q,
  c: { slug: string; name: string; ownerEmail: string | null; pinHash: string; look: ShopLook; trialEndsAt?: Date },
): Promise<Clinic> {
  const rows = await q.query(
    `insert into clinics (slug, name, owner_email, pin_hash, look, trial_ends_at)
     values ($1,$2,$3,$4,$5, coalesce($6::timestamptz, now() + interval '60 days')) returning *`,
    [c.slug, c.name, c.ownerEmail, c.pinHash, JSON.stringify(c.look), c.trialEndsAt ?? null],
  );
  return rowToClinic(rows[0]);
}

export async function updateClinic(q: Q, id: string, patch: { name?: string; pinHash?: string; look?: ShopLook; bumpSession?: boolean }) {
  const sets: string[] = [];
  const params: unknown[] = [];
  const set = (col: string, v: unknown) => {
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  };
  if (patch.name !== undefined) set("name", patch.name);
  if (patch.pinHash !== undefined) set("pin_hash", patch.pinHash);
  if (patch.look !== undefined) set("look", JSON.stringify(patch.look));
  if (patch.bumpSession) sets.push("session_version = session_version + 1");
  if (!sets.length) return;
  params.push(id);
  await q.query(`update clinics set ${sets.join(", ")} where id = $${params.length}`, params);
}

/** نفس منطق قفل الطوابير: 5 محاولات ثمّ 15 دقيقة. */
export async function claimClinicLoginAttempt(q: Q, clinicId: string, now: Date): Promise<boolean> {
  const rows = await q.query(
    `update clinics
        set failed_logins = case when locked_until is not null and locked_until <= $2 then 1 else failed_logins + 1 end,
            locked_until = case
              when (case when locked_until is not null and locked_until <= $2 then 1 else failed_logins + 1 end) >= 5 then $3::timestamptz
              when locked_until is not null and locked_until <= $2 then null
              else locked_until end
      where id = $1 and (locked_until is null or locked_until <= $2 or failed_logins < 5)
      returning failed_logins`,
    [clinicId, now, new Date(now.getTime() + 15 * 60000)],
  );
  return rows.length === 1 && Number((rows[0] as { failed_logins: number }).failed_logins) <= 5;
}

export async function resetClinicLoginAttempts(q: Q, clinicId: string) {
  await q.query("update clinics set failed_logins = 0, locked_until = null where id = $1", [clinicId]);
}

/** أطبّاء العيادة بترتيب ثابت (الأقدم أوّلاً). */
export async function listClinicShops(q: Q, clinicId: string): Promise<Shop[]> {
  const rows = await q.query(`select ${SHOP_COLS} from ${SHOP_FROM} where s.clinic_id = $1 order by s.created_at, s.slug`, [clinicId]);
  return rows.map(rowToShop);
}

/** يضمّ طابوراً إلى عيادة بشرط ألّا يكون عضواً في عيادة أخرى (ذرّي). */
export async function attachShop(q: Q, shopId: string, clinicId: string, room: string | null): Promise<boolean> {
  const rows = await q.query(
    "update shops set clinic_id = $2, room = coalesce($3, room) where id = $1 and (clinic_id is null or clinic_id = $2) returning id",
    [shopId, clinicId, room],
  );
  return rows.length === 1;
}

export async function detachShop(q: Q, shopId: string, clinicId: string): Promise<boolean> {
  const rows = await q.query("update shops set clinic_id = null where id = $1 and clinic_id = $2 returning id", [shopId, clinicId]);
  return rows.length === 1;
}

export async function setRoom(q: Q, shopId: string, clinicId: string, room: string | null): Promise<boolean> {
  const rows = await q.query("update shops set room = $3 where id = $1 and clinic_id = $2 returning id", [shopId, clinicId, room]);
  return rows.length === 1;
}

export async function setAssistantPin(q: Q, shopId: string, pinHash: string | null) {
  await q.query("update shops set assistant_pin_hash = $2, assistant_version = assistant_version + 1 where id = $1", [shopId, pinHash]);
}

export interface LiveRow {
  shopId: string;
  closed: boolean;
  currentNumber: number | null;
  calledAt: Date | null;
  waiting: number;
  served: number;
  nextNumbers: number[];
  doneN: number;
  doneSumMin: number;
}

/**
 * حالة اليوم لكلّ أطبّاء العيادة في استعلام واحد — أعداد وأرقام فقط (لا أسماء ولا هواتف).
 */
export async function clinicLive(q: Q, clinicId: string, day: string): Promise<{ shop: Shop; live: LiveRow }[]> {
  const rows = await q.query(
    `select ${SHOP_COLS}, s.id as shop_id,
            coalesce(qd.closed, false) as closed,
            cur.number as cur_number, cur.called_at as cur_called_at,
            (select count(*) from tickets t where t.shop_id = s.id and t.day = $2 and t.status = 'waiting' and not t.held) as waiting,
            (select count(*) from tickets t where t.shop_id = s.id and t.day = $2 and t.status = 'done') as served,
            (select coalesce(array_agg(x.number order by x.number), '{}') from
               (select t.number from tickets t where t.shop_id = s.id and t.day = $2 and t.status = 'waiting' and not t.held
                 order by t.number limit 3) x) as next_numbers,
            dur.n as done_n, dur.sum_min as done_sum
       from ${SHOP_FROM}
       left join queue_days qd on qd.shop_id = s.id and qd.day = $2
       left join lateral (
         select t.number, t.called_at from tickets t
          where t.shop_id = s.id and t.day = $2 and t.status = 'called'
          order by t.called_at desc nulls last limit 1) cur on true
       left join lateral (
         select count(*) as n, coalesce(sum(m), 0) as sum_min from (
           select extract(epoch from (t.done_at - t.called_at)) / 60.0 as m from tickets t
            where t.shop_id = s.id and t.day = $2 and t.status = 'done' and t.called_at is not null and t.done_at is not null) z
          where m >= 0.5 and m <= 180) dur on true
      where s.clinic_id = $1
      order by s.created_at, s.slug`,
    [clinicId, day],
  );
  const out: { shop: Shop; live: LiveRow }[] = [];
  for (const r of rows) {
    const nexts = r.next_numbers;
    const arr = Array.isArray(nexts) ? nexts : typeof nexts === "string" ? nexts.replace(/[{}]/g, "").split(",").filter(Boolean) : [];
    out.push({ shop: rowToShop(r), live: {
      shopId: String(r.shop_id),
      closed: Boolean(r.closed),
      currentNumber: r.cur_number == null ? null : Number(r.cur_number),
      calledAt: d(r.cur_called_at),
      waiting: Number(r.waiting),
      served: Number(r.served),
      nextNumbers: arr.map(Number),
      doneN: Number(r.done_n ?? 0),
      doneSumMin: Number(r.done_sum ?? 0),
    } });
  }
  return out;
}

// ————————————————————————— اشتراك العيادة (014_clinic_billing) —————————————————————————

/** يمدّد اشتراك العيادة: من الأبعد بين (الآن، نهاية التجربة، نهاية الاشتراك الحالي) — كـ repo.extendSubscription. */
export async function extendClinicSubscription(q: Q, clinicId: string, months: number, now: Date): Promise<Date | null> {
  const rows = await q.query<{ paid_until: Date }>(
    `update clinics set paid_until = greatest($2::timestamptz, trial_ends_at, coalesce(paid_until, $2::timestamptz))
                                    + make_interval(months => $3)
     where id = $1 returning paid_until`,
    [clinicId, now, months],
  );
  return rows[0] ? d(rows[0].paid_until) : null;
}

export async function listClinicPayments(q: Q, clinicId: string): Promise<Payment[]> {
  const rows = await q.query("select * from payments where clinic_id = $1 order by created_at desc limit 24", [clinicId]);
  return rows.map(rowToPayment);
}

/** لوحة المؤسّس: كلّ العيادات متعدّدة الأطبّاء مع عدد أطبّائها. */
export async function listClinicsAdmin(q: Q, now: Date): Promise<(Clinic & { doctors: number; hasPaid: boolean })[]> {
  const rows = await q.query(
    `select c.*, (select count(*)::int from shops s where s.clinic_id = c.id) as doctors,
            ${realPaymentCoversSql("clinic_id", "c.id", "$1")} as has_paid
       from clinics c order by c.created_at desc limit 500`,
    [now],
  );
  return rows.map((r) => ({ ...rowToClinic(r), doctors: Number(r.doctors), hasPaid: r.has_paid === true }));
}
