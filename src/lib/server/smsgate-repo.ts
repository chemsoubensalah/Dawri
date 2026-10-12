/** استعلامات SQL لجدول sms_gateways (رسائل SMS من هاتف العيادة). */
import type { Q, Row } from "./db";

const d = (v: unknown): Date | null => (v == null ? null : v instanceof Date ? v : new Date(String(v)));

export interface GatewayRow {
  shopId: string;
  provider: "smsgate";
  baseUrl: string;
  username: string;
  /** مشفّرة — لا تُرسل أبداً إلى المتصفّح */
  passwordEnc: string;
  enabled: boolean;
  sendCalled: boolean;
  sendSoon: boolean;
  sendCodes: boolean;
  deviceName: string | null;
  lastOkAt: Date | null;
  lastError: string | null;
  lastErrorAt: Date | null;
  sentMonth: string | null;
  sentCount: number;
  testLog: Date[];
}

/** مصفوفة timestamptz[] قد تصل مصفوفةً (pg/PGlite) أو نصّاً "{...}". */
function dates(v: unknown): Date[] {
  if (Array.isArray(v)) return v.map((x) => d(x)!).filter(Boolean);
  if (typeof v === "string" && v.length > 2) {
    return v
      .slice(1, -1)
      .split(",")
      .map((x) => new Date(x.replace(/^"|"$/g, "")))
      .filter((x) => !Number.isNaN(x.getTime()));
  }
  return [];
}

export function rowToGateway(r: Row): GatewayRow {
  return {
    shopId: String(r.shop_id),
    provider: "smsgate",
    baseUrl: String(r.base_url),
    username: String(r.username),
    passwordEnc: String(r.password_enc),
    enabled: Boolean(r.enabled),
    sendCalled: Boolean(r.send_called),
    sendSoon: Boolean(r.send_soon),
    sendCodes: Boolean(r.send_codes),
    deviceName: (r.device_name as string | null) ?? null,
    lastOkAt: d(r.last_ok_at),
    lastError: (r.last_error as string | null) ?? null,
    lastErrorAt: d(r.last_error_at),
    sentMonth: (r.sent_month as string | null) ?? null,
    sentCount: Number(r.sent_count ?? 0),
    testLog: dates(r.test_log),
  };
}

export async function getGateway(q: Q, shopId: string): Promise<GatewayRow | null> {
  const rows = await q.query("select * from sms_gateways where shop_id = $1", [shopId]);
  return rows[0] ? rowToGateway(rows[0]) : null;
}

/** هل يرسل هاتف العيادة رموز التحقّق؟ (استعلام خفيف لصفحة المريض) */
export async function gatewaySendsCodes(q: Q, shopId: string): Promise<boolean> {
  const rows = await q.query("select 1 from sms_gateways where shop_id = $1 and enabled and send_codes", [shopId]);
  return rows.length > 0;
}

export interface GatewayWrite {
  baseUrl: string;
  username: string;
  passwordEnc: string;
  enabled: boolean;
  sendCalled: boolean;
  sendSoon: boolean;
  sendCodes: boolean;
  deviceName: string | null;
  /** نتيجة فحص الربط: null = لم نفحص (نُبقي الحالة السابقة) */
  check: { ok: true } | { ok: false; error: string } | null;
}

export async function upsertGateway(q: Q, shopId: string, w: GatewayWrite, now: Date) {
  const okAt = w.check?.ok ? now : null;
  const err = w.check && !w.check.ok ? w.check.error : null;
  const checked = w.check !== null;
  await q.query(
    `insert into sms_gateways (shop_id, base_url, username, password_enc, enabled, send_called, send_soon, send_codes,
                               device_name, last_ok_at, last_error, last_error_at, check_log, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,case when $11::text is null then null else $12::timestamptz end,
             case when $13 then array[$12::timestamptz] else '{}'::timestamptz[] end, $12, $12)
     on conflict (shop_id) do update set
       base_url = excluded.base_url,
       username = excluded.username,
       password_enc = excluded.password_enc,
       enabled = excluded.enabled,
       send_called = excluded.send_called,
       send_soon = excluded.send_soon,
       send_codes = excluded.send_codes,
       device_name = case when $13 then excluded.device_name else sms_gateways.device_name end,
       last_ok_at = case when $13 then coalesce(excluded.last_ok_at, sms_gateways.last_ok_at) else sms_gateways.last_ok_at end,
       last_error = case when $13 then excluded.last_error else sms_gateways.last_error end,
       last_error_at = case when $13 then excluded.last_error_at else sms_gateways.last_error_at end,
       updated_at = excluded.updated_at`,
    [shopId, w.baseUrl, w.username, w.passwordEnc, w.enabled, w.sendCalled, w.sendSoon, w.sendCodes, w.deviceName, okAt, err, now, checked],
  );
}

export async function deleteGateway(q: Q, shopId: string) {
  await q.query("delete from sms_gateways where shop_id = $1", [shopId]);
}

/**
 * يحجز مكاناً في سجلّ المحاولات (رسائل تجريبية أو فحوص ربط) إن بقي أقلّ من max خلال النافذة.
 * تحديث واحد ذرّي: Postgres يعيد تقييم الشرط على الصفّ المقفل، فلا تتجاوز طلبات متزامنة الحدّ.
 */
export async function claimSlot(q: Q, shopId: string, column: "test_log" | "check_log", since: Date, max: number, now: Date) {
  const col = column === "test_log" ? "test_log" : "check_log";
  const rows = await q.query(
    `update sms_gateways
        set ${col} = array_append(array(select x from unnest(${col}) as x where x > $2 order by x), $3::timestamptz)
      where shop_id = $1
        and (select count(*) from unnest(${col}) as x where x > $2) < $4
      returning shop_id`,
    [shopId, since, now, max],
  );
  return rows.length > 0;
}

/** نجاح إرسال: عدّاد الشهر (يُصفَّر مع شهر جديد) + آخر نجاح + مسح آخر خطأ. */
export async function recordSent(q: Q, shopId: string, month: string, now: Date) {
  await q.query(
    `update sms_gateways
        set sent_count = case when sent_month = $2 then sent_count + 1 else 1 end,
            sent_month = $2,
            last_ok_at = $3,
            last_error = null,
            last_error_at = null
      where shop_id = $1`,
    [shopId, month, now],
  );
}

export async function recordError(q: Q, shopId: string, error: string, now: Date) {
  await q.query("update sms_gateways set last_error = $2, last_error_at = $3 where shop_id = $1", [
    shopId,
    error.slice(0, 40),
    now,
  ]);
}
