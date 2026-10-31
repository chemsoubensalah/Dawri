/**
 * المواعيد: الحجز المسبق مدمجاً مع الطابور الحيّ.
 *  - المريض يحجز وقتاً (بنفس تحقّق الهاتف المستعمل للتذاكر).
 *  - يوم الموعد: «وصلت» ← تذكرة ذات أولوية في طابور اليوم (نفس مسار التذاكر، داخل معاملة مقفلة).
 *  - لم يصل حتى الموعد + المهلة ← غائب (عند القراءة وفي المهمّة اليومية)، ويُحسب في عدّاد الغياب.
 * كلّ حجز لعيادة/يوم يقفل صفّ ذلك اليوم (repo.lockDay): لا يتجاوز وقتٌ سعتَه أبداً.
 */
import { initialFlags, planCheckIn } from "../domain/queue";
import { dayKey, isValidHours, localTime, parseHHMM } from "../domain/time";
import { formatPhone, maskPhone, normalizePhone } from "../domain/phone";
import {
  DomainError,
  NO_SHOW_RETENTION_DAYS,
  OPEN_STATUSES,
  type Action,
  type Lang,
  type Shop,
  type Ticket,
  type TicketPatch,
  type WeeklyHours,
} from "../domain/types";
import {
  addDays,
  APPT_RETENTION_DAYS,
  availability,
  beforeSlot,
  BOOKING_LIMITS,
  CHECKIN_EARLY_MIN,
  checkinWindow,
  daysBetween,
  hhmm,
  isDayKey,
  isOverdue,
  isTimeKey,
  MAX_ONLINE_PER_HOUR,
  MAX_UPCOMING_PER_PHONE,
  slotInstant,
  slotVerdict,
  type Appointment,
  type ApptSource,
  type BookingNumberKey,
  type BookingSettings,
  type DayAvailability,
} from "../domain/appointments";
import { drTitle, isLang, t } from "../i18n";
import { buildIcs } from "../ics";
import { hashCode, randomDigits, safeEqual } from "./auth";
import { now as clockNow } from "./clock";
import { getDb, type Q } from "./db";
import * as repo from "./repo";
import * as ar from "./appointments-repo";
import { claimRate, guardClientIp } from "./ratelimit";
import { isSubscriptionActive, mutate } from "./service";
import { getSms } from "./sms";
import { clinicSendsCodes, codeSender } from "./smsgate";
import { shortCode } from "./whatsapp";
import { phoneCheckRequired } from "./verify";
import { activeReasonConfig, cleanReason, reasonConfigOf } from "../domain/reasons";
import { checkPhoneGap, checkReasonCap, fullReasons, limitsOf, PATIENT, type Who } from "./limits";

const DAY_MS = 86_400_000;
/**
 * رموز الحجز لكلّ عيادة في الساعة: عدّاد مستقلّ وأقلّ بكثير من حدّ الطابور الحيّ (200)،
 * فلا يستنفد إغراقُ صفحة الحجز رموزَ المرضى الواقفين عند الباب.
 */
export const BOOKING_CODES_PER_HOUR = 50;
export const bookingCodesKey = (shopId: string) => `codes:booking:${shopId}`;

// ————————————————————————— أدوات —————————————————————————


function demoMode() {
  return process.env.DAWRI_DEMO === "1" || !process.env.DATABASE_URL;
}

/**
 * كيف يُتحقَّق من هاتف المريض عند الحجز؟ unavailable = التحقّق مطلوب ولا وسيلة إرسال:
 * لا مزوّد عامّ ولا هاتف عيادة يرسل الرموز (نفس منطق أخذ الرقم — service.ts).
 */
export type VerifyMode = "none" | "sms" | "unavailable";
export async function verifyMode(shopId: string): Promise<VerifyMode> {
  if (!(await phoneCheckRequired(shopId))) return "none";
  return getSms() !== null || (await clinicSendsCodes(shopId)) ? "sms" : "unavailable";
}

function cleanName(v: unknown): string {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  if (s.length < 2 || s.length > 60) throw new DomainError("invalid_name");
  return s;
}

function requirePhone(v: unknown): string {
  const p = typeof v === "string" ? normalizePhone(v) : null;
  if (!p) throw new DomainError("invalid_phone");
  return p;
}

const langOf = (v: unknown, fallback: Lang): Lang => (isLang(v) ? v : fallback);

async function shopBySlug(q: Q, slug: unknown): Promise<Shop> {
  const shop = typeof slug === "string" ? await repo.getShopBySlug(q, slug.toLowerCase()) : null;
  if (!shop) throw new DomainError("shop_not_found", 404);
  return shop;
}

/** العيادة تقبل الحجز عبر الإنترنت الآن؟ */
async function bookableShop(q: Q, slug: unknown, now: Date) {
  const shop = await shopBySlug(q, slug);
  const settings = await ar.getSettings(q, shop.id);
  if (!settings.enabled) throw new DomainError("ap_off", 409);
  if (!isSubscriptionActive(shop, now)) throw new DomainError("subscription", 409);
  return { shop, settings };
}

/** اليوم والوقت المطلوبان: صيغة صحيحة وضمن مدّة الحجز. */
function slotInput(body: { day?: unknown; time?: unknown }, s: BookingSettings, now: Date) {
  const { day, time } = body;
  if (!isDayKey(day) || !isTimeKey(time)) throw new DomainError("ap_invalid_slot");
  const ahead = daysBetween(dayKey(now), day);
  if (ahead < 0 || ahead > s.daysAhead) throw new DomainError("ap_invalid_slot");
  return { day, time };
}

/** رمز واتساب قصير للتذكرة (فريد في اليوم) — مثل التذاكر العادية. */
async function freshWaCode(q: Q, day: string): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const code = shortCode();
    if (!(await repo.findTicketByWaCode(q, day, code))) return code;
  }
  return shortCode(7).slice(0, 5);
}

/**
 * يتحقّق من رمز الرسالة دون استهلاكه (يُستهلك داخل معاملة الحجز إن نجح فقط،
 * فيستطيع المريض اختيار وقت آخر بنفس الرمز إن سُبق إلى الوقت).
 * المحاولة الخاطئة تُسجَّل خارج المعاملة فلا يلغيها التراجع.
 */
async function checkCode(q: Q, shop: Shop, phone: string, code: unknown, now: Date): Promise<number | null> {
  if (!(await phoneCheckRequired(shop.id))) return null;
  const c = typeof code === "string" ? code.trim() : "";
  const row = await repo.latestCode(q, shop.id, phone, now);
  if (!row || row.attempts >= 5) throw new DomainError("code_expired");
  if (!/^\d{6}$/.test(c) || !safeEqual(hashCode(shop.id, phone, c), row.code_hash)) {
    await repo.markCodeAttempt(q, row.id, false, now);
    throw new DomainError("invalid_code");
  }
  return Number(row.id);
}

async function slotCheck(q: Q, shop: Shop, s: BookingSettings, day: string, time: string, now: Date, mode: "online" | "desk", closedToday: boolean) {
  const counts = await ar.activeCounts(q, shop.id, day, day);
  const days = availability({ settings: s, shopHours: shop.hours, daysOff: shop.daysOff, now, counts, mode, closedToday, onlyDay: day });
  const v = slotVerdict(days, day, time);
  if (v === "invalid") throw new DomainError("ap_invalid_slot");
  if (v === "unavailable") throw new DomainError("ap_slot_unavailable", 409);
  if (v === "day_full") throw new DomainError("ap_day_full", 409);
}

/** حدود الحجز عبر الإنترنت لكلّ هاتف: مواعيد قادمة قليلة، ولا حجز لكثير الغياب. */
async function guardPhone(q: Q, shop: Shop, phone: string, now: Date) {
  if ((await ar.countUpcomingByPhone(q, shop.id, phone, dayKey(now))) >= MAX_UPCOMING_PER_PHONE) {
    throw new DomainError("ap_too_many", 409);
  }
  const since = new Date(now.getTime() - NO_SHOW_RETENTION_DAYS * DAY_MS);
  if ((await repo.countNoShows(q, shop.id, phone, since)) >= shop.settings.noShowLimit) {
    throw new DomainError("ap_no_shows", 403);
  }
}

/**
 * الحجز نفسه، مقفلاً على صفّ يوم الموعد: كلّ الحجوزات لنفس العيادة واليوم تمرّ واحداً واحداً،
 * فلا يتجاوز وقتٌ عدد أماكنه، ولا يأخذ هاتف موعدين نشطين في نفس اليوم.
 */
async function bookCore(
  shop: Shop,
  input: { name: string; phone: string | null; day: string; time: string; lang: Lang; source: ApptSource; reason?: string | null },
  now: Date,
  /** رمز التحقّق: يُستهلك داخل المعاملة. وجوده = إثبات ملكية الهاتف */
  onCommit?: (q: Q) => Promise<void>,
  /** السكرتيرة: تتجاوز حدود الطبيب إن سمح (بعد تنبيه) — src/lib/server/limits.ts */
  who: Who = PATIENT,
): Promise<{ id: string; existing: boolean }> {
  const db = await getDb();
  const online = input.source === "online";
  try {
    return await db.tx(async (q) => {
      const qd = await repo.lockDay(q, shop.id, input.day);
      const s = await ar.getSettings(q, shop.id); // قيم حديثة داخل القفل
      if (online && !s.enabled) throw new DomainError("ap_off", 409);
      if (input.phone) {
        const existing = await ar.findActiveByPhone(q, shop.id, input.day, input.phone);
        if (existing) {
          // إعادة الإرسال (شبكة بطيئة) أو حجز ثانٍ في نفس اليوم ← نفس الموعد، لصاحب الهاتف المؤكَّد فقط:
          // بلا رمز (PHONE_VERIFICATION=off) لا نكشف رابط موعد شخص آخر لمن كتب رقمه
          if (!online || !onCommit) throw new DomainError("ap_already_booked", 409);
          await onCommit(q);
          return { id: existing.id, existing: true };
        }
        if (online) await guardPhone(q, shop, input.phone, now);
        await checkPhoneGap(q, shop, input.phone, { kind: "appt", today: dayKey(now), visitDay: input.day }, who);
      }
      if (online && (await ar.countRecentOnline(q, shop.id, new Date(now.getTime() - 3600_000))) >= MAX_ONLINE_PER_HOUR) {
        throw new DomainError("ap_rate", 429);
      }
      await slotCheck(q, shop, s, input.day, input.time, now, online ? "online" : "desk", input.day === dayKey(now) && qd.closed);
      await checkReasonCap(q, shop, input.day, input.reason, who);
      await onCommit?.(q);
      const a = await ar.insertAppointment(q, { shopId: shop.id, ...input, now });
      return { id: a.id, existing: false };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new DomainError("ap_already_booked", 409);
    throw e;
  }
}

// ————————————————————————— صفحة العيادة والحجز (المريض) —————————————————————————

export interface BookingTeaser {
  today: string;
  next: { day: string; time: string } | null;
}

/** لصفحة العيادة: هل نعرض «احجز موعداً»؟ ومتى أقرب وقت متاح؟ (null = لا حجز) */
export async function bookingTeaser(shop: Shop): Promise<BookingTeaser | null> {
  const db = await getDb();
  const now = clockNow();
  const s = await ar.getSettings(db, shop.id);
  if (!s.enabled || !isSubscriptionActive(shop, now) || (await verifyMode(shop.id)) === "unavailable") return null;
  const today = dayKey(now);
  const [counts, qd] = await Promise.all([ar.activeCounts(db, shop.id, today, addDays(today, s.daysAhead)), repo.getDay(db, shop.id, today)]);
  const days = availability({ settings: s, shopHours: shop.hours, daysOff: shop.daysOff, now, counts, mode: "online", closedToday: qd.closed });
  return { today, next: firstFree(days) };
}

/** الأيّام والأوقات المتاحة للحجز (رخيص: استعلامان). */
export async function publicAvailability(slug: string) {
  const db = await getDb();
  const now = clockNow();
  const { shop, settings } = await bookableShop(db, slug, now);
  const today = dayKey(now);
  const last = addDays(today, settings.daysAhead);
  const [counts, qd, verify, full] = await Promise.all([
    ar.activeCounts(db, shop.id, today, last),
    repo.getDay(db, shop.id, today),
    verifyMode(shop.id),
    fullReasons(db, shop, today, last),
  ]);
  return {
    slug: shop.slug,
    today,
    slotMin: settings.slotMin,
    perSlot: settings.perSlot,
    minLeadMin: settings.minLeadMin,
    verify,
    days: availability({ settings, shopHours: shop.hours, daysOff: shop.daysOff, now, counts, mode: "online", closedToday: qd.closed }),
    /** الحالات المكتملة لكلّ يوم (حدّ الطبيب اليوميّ) */
    full,
  };
}

export type PublicAvailability = Awaited<ReturnType<typeof publicAvailability>>;

/**
 * الخطوة 1: رمز تحقّق بالرسالة (نفس جدول phone_codes، ونفس المرسل: هاتف العيادة أوّلاً ثمّ المزوّد العامّ).
 * client.ip: عنوان العميل (من المسار) — حدّ رموز لكلّ عميل ضدّ إغراق أرقام عشوائية.
 */
export async function requestBookingCode(
  slug: string,
  body: { name?: unknown; phone?: unknown; day?: unknown; time?: unknown; lang?: unknown; reason?: unknown },
  client: { ip?: string | null } = {},
) {
  const db = await getDb();
  const now = clockNow();
  const { shop, settings } = await bookableShop(db, slug, now);
  cleanName(body.name);
  const phone = requirePhone(body.phone);
  const { day, time } = slotInput(body, settings, now);
  const required = await phoneCheckRequired(shop.id);
  // تحقّق مسبق بلا قفل: لا نرسل رسالة (لها كلفة) لحجز مستحيل.
  // من له موعد في ذلك اليوم يستطيع استرجاعه بالرمز (وبلا تحقّق: لا استرجاع لموعد شخص آخر).
  if (await ar.findActiveByPhone(db, shop.id, day, phone)) {
    if (!required) throw new DomainError("ap_already_booked", 409);
  } else {
    await guardPhone(db, shop, phone, now);
    await checkPhoneGap(db, shop, phone, { kind: "appt", today: dayKey(now), visitDay: day }, PATIENT);
    await slotCheck(db, shop, settings, day, time, now, "online", day === dayKey(now) && (await repo.getDay(db, shop.id, day)).closed);
    await checkReasonCap(db, shop, day, cleanReason(reasonConfigOf(shop), body.reason), PATIENT);
  }
  if (!required) return { sent: false, verify: false, devCode: undefined as string | undefined };
  const sms = await codeSender(shop, getSms()); // هاتف العيادة أوّلاً (إن فعّلت ذلك) ثمّ المزوّد العامّ
  if (!sms) throw new DomainError("sms_unavailable", 503);
  if ((await repo.countRecentCodes(db, shop.id, phone, new Date(now.getTime() - 30 * 60000))) >= 3) {
    throw new DomainError("too_many_codes", 429);
  }
  if ((await repo.countRecentCodes(db, shop.id, null, new Date(now.getTime() - 60 * 60000))) >= 200) {
    throw new DomainError("too_many_codes", 429);
  }
  await guardClientIp(db, client.ip, "booking", now);
  // عدّاد مستقلّ لرموز الحجز: لا تستنفد حدّ الطابور الحيّ
  if (!(await claimRate(db, bookingCodesKey(shop.id), 3600_000, BOOKING_CODES_PER_HOUR, now))) {
    throw new DomainError("too_many_codes", 429);
  }
  const code = randomDigits(6);
  await repo.insertCode(db, shop.id, phone, hashCode(shop.id, phone, code), now, new Date(now.getTime() + 10 * 60000));
  try {
    await sms.send(phone, code, langOf(body.lang, shop.defaultLang));
  } catch (e) {
    if (e instanceof DomainError) throw e;
    console.error("[sms]", e);
    throw new DomainError("sms_failed", 502);
  }
  return { sent: true, verify: true, devCode: demoMode() ? code : undefined };
}

/** الخطوة 2: الحجز (الرمز يُستهلك فقط إن نجح الحجز). */
export async function bookOnline(
  slug: string,
  body: { name?: unknown; phone?: unknown; code?: unknown; day?: unknown; time?: unknown; lang?: unknown; reason?: unknown },
  client: { ip?: string | null } = {},
): Promise<{ appointmentId: string; existing: boolean }> {
  const db = await getDb();
  const now = clockNow();
  const { shop, settings } = await bookableShop(db, slug, now);
  const name = cleanName(body.name);
  const phone = requirePhone(body.phone);
  const reason = cleanReason(reasonConfigOf(shop), body.reason);
  const { day, time } = slotInput(body, settings, now);
  const codeId = await checkCode(db, shop, phone, body.code, now);
  // بلا رمز (لا وسيلة تحقّق): حدّ لكلّ شبكة بدل الرمز
  if (codeId === null) await guardClientIp(db, client.ip, "booking", now);
  const r = await bookCore(
    shop,
    { name, phone, day, time, reason, lang: langOf(body.lang, shop.defaultLang), source: "online" },
    now,
    codeId === null
      ? undefined
      : async (q) => {
          if (!(await ar.claimCode(q, codeId, now))) throw new DomainError("code_expired");
        },
  );
  return { appointmentId: r.id, existing: r.existing };
}

// ————————————————————————— صفحة الموعد (رابط خاصّ غير قابل للتخمين) —————————————————————————

export async function appointmentView(id: string) {
  const db = await getDb();
  let a = await ar.getAppointment(db, id);
  if (!a) throw new DomainError("ap_not_found", 404);
  const shop = (await repo.getShopById(db, a.shopId))!;
  const s = await ar.getSettings(db, shop.id);
  const now = clockNow();
  if (a.status === "booked" && isOverdue(a, s.arrivalGraceMin, now)) {
    await sweepOverdue({ apptId: a.id });
    a = (await ar.getAppointment(db, id))!;
  }
  const ticket = a.ticketId ? await repo.getTicket(db, a.ticketId) : null;
  const win = checkinWindow(a, s.arrivalGraceMin, now);
  const active = isSubscriptionActive(shop, now);
  const start = slotInstant(a.day, a.time);
  return {
    id: a.id,
    day: a.day,
    time: a.time,
    name: a.name,
    phone: maskPhone(a.phone),
    reason: a.reason ?? null,
    lang: a.lang,
    status: a.status,
    ticket: ticket ? { id: ticket.id, number: ticket.number, status: ticket.status } : null,
    window: win,
    /** متى يُفتح زرّ «وصلت» */
    opensAt: hhmm(Math.max(0, parseHHMM(a.time)! - CHECKIN_EARLY_MIN)),
    canCancel: a.status === "booked" && beforeSlot(a, now),
    canCheckin: a.status === "booked" && win === "open" && active,
    today: dayKey(now),
    serverTime: now.toISOString(),
    /** بداية الموعد ونهايته (للعدّ التنازلي والتقويم) */
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + s.slotMin * 60_000).toISOString(),
    shop: { slug: shop.slug, name: shop.name, kind: shop.kind, profile: shop.profile, look: shop.look },
  };
}

export type AppointmentView = Awaited<ReturnType<typeof appointmentView>>;

export async function appointmentAction(
  id: string,
  body: { action?: unknown; door?: unknown },
): Promise<{ view: AppointmentView; ticketId: string | null }> {
  const db = await getDb();
  const a = await ar.getAppointment(db, id);
  if (!a) throw new DomainError("ap_not_found", 404);
  const shop = (await repo.getShopById(db, a.shopId))!;
  const now = clockNow();
  if (body.action === "cancel") {
    if (a.status !== "booked") throw new DomainError("ap_closed", 409);
    if (!beforeSlot(a, now)) throw new DomainError("ap_cancel_late", 409);
    if (!(await ar.cancelAppointment(db, a.id, now))) throw new DomainError("ap_closed", 409);
    return { view: await appointmentView(id), ticketId: null };
  }
  if (body.action === "checkin") {
    if (!isSubscriptionActive(shop, now)) throw new DomainError("subscription", 409);
    // رمز الباب (QR الملصق) = حضور مؤكَّد. بدونه نعطي الأولوية، ويبقى «في القاعة» غير مؤكَّد:
    // إن نودي ولم يحضر يُتخطّى تلقائياً — الغائب لا يوقف الطابور.
    let arrived = false;
    if (body.door !== undefined && body.door !== null && body.door !== "") {
      if (!(typeof body.door === "string" && safeEqual(body.door, shop.doorCode))) throw new DomainError("bad_door_code", 403);
      arrived = true;
    }
    const r = await convert(shop, a.id, { arrived, staff: false });
    return { view: await appointmentView(id), ticketId: r.ticketId };
  }
  throw new DomainError("invalid_action");
}

/** ملفّ .ics لإضافة الموعد إلى تقويم الهاتف (مع تذكير قبل ساعة). */
export async function appointmentIcs(id: string, baseUrl: string) {
  const db = await getDb();
  const a = await ar.getAppointment(db, id);
  if (!a) throw new DomainError("ap_not_found", 404);
  if (a.status !== "booked" && a.status !== "arrived") throw new DomainError("ap_closed", 409);
  const shop = (await repo.getShopById(db, a.shopId))!;
  const s = await ar.getSettings(db, shop.id);
  const start = slotInstant(a.day, a.time);
  const lang = a.lang;
  const doctor = drTitle(lang, shop.kind, shop.profile.doctorName);
  const body = buildIcs({
    uid: `${a.id}@dawri`,
    now: clockNow(),
    start,
    end: new Date(start.getTime() + s.slotMin * 60_000),
    summary: t(lang, "ap_icsSummary", { shop: shop.name }),
    location: shop.profile.address,
    description: [doctor, shop.profile.phone, `${baseUrl}/a/${a.id}`].filter(Boolean).join("\n"),
    url: `${baseUrl}/a/${a.id}`,
    alarm: t(lang, "ap_icsAlarm", { shop: shop.name }),
  });
  return { body, filename: `dawri-${a.day}-${a.time.replace(":", "")}.ics` };
}

// ————————————————————————— الوصول: موعد ← تذكرة ذات أولوية —————————————————————————

/**
 * يحوّل الموعد إلى تذكرة في طابور اليوم عبر نفس مسار التذاكر (mutate: قفل اليوم + planTick + التنبيهات).
 * idempotent: الضغطة الثانية تُرجع نفس التذكرة.
 * إن كان للهاتف تذكرة اليوم: تصير هي ذات الأولوية (تذكرة واحدة لكلّ هاتف في اليوم).
 */
async function convert(shop: Shop, apptId: string, o: { arrived: boolean; staff: boolean }) {
  const { result } = await mutate(shop, async ({ q, now, day, tickets }) => {
    const a = await ar.lockAppointment(q, apptId);
    if (!a || a.shopId !== shop.id) throw new DomainError("ap_not_found", 404);
    if (a.status === "arrived" && a.ticketId) {
      const tk = tickets.find((x) => x.id === a.ticketId);
      // جاء الآن برمز الباب بعد أن ضغط «وصلت» من البيت؟ نسجّل حضوره
      const actions = tk && o.arrived && !tk.arrivedAt ? safeCheckIn(tk, now, shop) : [];
      return { actions, result: { ticketId: a.ticketId, number: tk?.number ?? null, existing: true } };
    }
    if (a.status === "cancelled" || a.status === "arrived") throw new DomainError("ap_closed", 409);
    if (a.day !== day) throw new DomainError(a.day > day ? "ap_checkin_early" : "ap_closed", 409);
    if (!o.staff) {
      if (a.status !== "booked") throw new DomainError("ap_closed", 409);
      const s = await ar.getSettings(q, shop.id);
      const w = checkinWindow(a, s.arrivalGraceMin, now);
      if (w === "early") throw new DomainError("ap_checkin_early", 409);
      if (w === "late") throw new DomainError("ap_checkin_late", 409);
    } else if (a.status === "no_show" && a.phone && (await ar.findActiveByPhone(q, shop.id, a.day, a.phone))) {
      throw new DomainError("ap_already_booked", 409);
    }

    const actions: Action[] = [];
    const existing = a.phone ? tickets.find((x) => x.phone === a.phone) : undefined;
    let ticketId: string;
    let number: number;
    if (existing) {
      if (OPEN_STATUSES.includes(existing.status)) {
        const patch: TicketPatch = { held: false, confirmedAt: existing.confirmedAt ?? now };
        if (existing.status === "pending_approval") patch.status = "waiting"; // الموعد مقبول مسبقاً
        if (o.arrived) {
          patch.arrivedAt = existing.arrivedAt ?? now;
          if (existing.status === "deferred") patch.status = "waiting";
        }
        actions.push({ kind: "update", id: existing.id, expect: [existing.status], patch });
      } else if (existing.status === "cancelled") {
        // ألغى رقمه العادي ثمّ جاء لموعده: نعيد فتح تذكرته (القاعدة: تذكرة واحدة لكلّ هاتف في اليوم)
        actions.push({
          kind: "update",
          id: existing.id,
          expect: ["cancelled"],
          patch: {
            status: "waiting",
            closedAt: null,
            calledAt: null,
            doneAt: null,
            deferredAt: null,
            held: false,
            confirmedAt: now,
            arrivedAt: o.arrived ? now : null,
            notifiedSoonAt: o.arrived ? now : null,
          },
        });
      } else {
        throw new DomainError("ap_ticket_done", 409);
      }
      await ar.setTicketPriority(q, existing.id, now);
      ticketId = existing.id;
      number = existing.number;
    } else {
      const tk = await createPriorityTicket(q, shop, a, { day, now, tickets }, o.arrived);
      ticketId = tk.id;
      number = tk.number;
    }
    await ar.markArrived(q, a.id, ticketId, now);
    return { actions, result: { ticketId, number, existing: false } };
  });
  return result;
}

/** تذكرة جديدة ذات أولوية لصاحب موعد — داخل معاملة mutate (صفّ اليوم مقفل). */
async function createPriorityTicket(
  q: Q,
  shop: Shop,
  a: Appointment,
  c: { day: string; now: Date; tickets: Ticket[] },
  arrived: boolean,
): Promise<{ id: string; number: number }> {
  const number = await repo.allocateNumber(q, shop.id, c.day);
  const flags = initialFlags(c.tickets, shop.settings, c.now, { arrived, source: "online", priority: true });
  const tk = await repo.insertTicket(q, {
    shopId: shop.id,
    day: c.day,
    number,
    name: a.name,
    phone: a.phone,
    reason: a.reason ?? null,
    lang: a.lang,
    source: "online",
    status: "waiting",
    createdAt: c.now,
    arrivedAt: flags.arrivedAt ?? null,
    confirmedAt: c.now, // قال «وصلت»: لا نسأله «هل ما زلت قادماً؟»
    notifiedSoonAt: flags.notifiedSoonAt ?? null,
    waCode: await freshWaCode(q, c.day),
  });
  await ar.setTicketPriority(q, tk.id, c.now);
  return { id: tk.id, number };
}

/**
 * من issueTicket (أخذ رقم عادي بهاتف مؤكَّد، بالرمز أو واتساب): إن كان لهذا الهاتف موعد اليوم
 * ونافذة الوصول مفتوحة، يأخذ رقماً ذا أولوية مرتبطاً بموعده — حتى إن حُجز الموعد هاتفياً أو من جهاز آخر.
 * null = لا موعد: يكمل المسار العادي.
 */
export async function walkInFromAppointment(
  q: Q,
  shop: Shop,
  o: { day: string; now: Date; tickets: Ticket[]; phone: string; atDoor: boolean },
): Promise<string | null> {
  const found = await ar.findActiveByPhone(q, shop.id, o.day, o.phone);
  if (!found || found.status !== "booked") return null;
  const s = await ar.getSettings(q, shop.id);
  if (checkinWindow(found, s.arrivalGraceMin, o.now) !== "open") return null;
  const a = await ar.lockAppointment(q, found.id);
  if (!a || a.status !== "booked") return null;
  const tk = await createPriorityTicket(q, shop, a, o, o.atDoor);
  await ar.markArrived(q, a.id, tk.id, o.now);
  return tk.id;
}

function safeCheckIn(ticket: Ticket, now: Date, shop: Shop): Action[] {
  try {
    return planCheckIn(ticket, now, shop.settings);
  } catch {
    return [];
  }
}

// ————————————————————————— الغياب —————————————————————————

/**
 * موعد محجوز فات وقته + المهلة: غائب (ويُسجَّل في عدّاد الغياب).
 * إلّا إن أخذ رقماً عادياً في ذلك اليوم: فقد جاء ← «وصل» مرتبطاً بتذكرته.
 */
export async function sweepOverdue(o: { shopId?: string | null; apptId?: string | null }): Promise<number> {
  const db = await getDb();
  const now = clockNow();
  const list = await ar.listBookedUntil(db, dayKey(now), o.shopId ?? null, o.apptId ?? null);
  let n = 0;
  for (const { appt, grace } of list) {
    if (!isOverdue(appt, grace, now)) continue;
    await db.tx(async (q) => {
      const tk = appt.phone ? await repo.findTicketByPhone(q, appt.shopId, appt.day, appt.phone) : null;
      if (tk && !["cancelled", "rejected", "no_show"].includes(tk.status)) {
        await ar.markArrived(q, appt.id, tk.id, now);
        return;
      }
      if (await ar.markNoShow(q, appt.id)) {
        n++;
        if (appt.phone) await ar.insertApptNoShow(q, appt.shopId, appt.phone, appt.id, now);
      }
    });
  }
  return n;
}

/** المهمّة اليومية: الغياب + محو الاسم والهاتف بعد 30 يوماً من تاريخ الموعد. */
export async function appointmentsCron() {
  const noShows = await sweepOverdue({});
  const db = await getDb();
  const anonymized = await ar.anonymizeBefore(db, addDays(dayKey(clockNow()), -APPT_RETENTION_DAYS));
  return { noShows, anonymized };
}

// ————————————————————————— السكرتيرة —————————————————————————

function staffRow(a: ar.StaffApptRow, walkIns: Map<string, number>) {
  return {
    id: a.id,
    day: a.day,
    time: a.time,
    name: a.name,
    phone: formatPhone(a.phone),
    reason: a.reason ?? null,
    source: a.source,
    status: a.status,
    ticketNumber: a.ticketNumber,
    /** وصله تذكير الصباح (رسالة من هاتف العيادة) */
    reminded: Boolean(a.remindedAt),
    /** للمحجوز: له رقم عادي اليوم؟ («حضر» يجعله ذا أولوية) */
    walkIn: a.status === "booked" && a.phone ? (walkIns.get(a.phone) ?? null) : null,
  };
}

export type StaffAppt = ReturnType<typeof staffRow>;

function firstFree(days: DayAvailability[]) {
  for (const d of days) {
    const s = d.slots.find((x) => x.left > 0);
    if (s) return { day: d.day, time: s.time };
  }
  return null;
}

export interface StaffDay {
  day: string;
  state: DayAvailability["state"];
  booked: number;
  capacity: number;
  items: StaffAppt[];
}

/**
 * today: مواعيد اليوم (لوحة الطابور — تُحدَّث كلّ بضع ثوانٍ، فنقرأ اليوم فقط).
 * upcoming: كلّ الأيّام القادمة مجمّعة مع عدد المحجوز والسعة (صفحة المواعيد).
 */
export async function staffAppointments(shop: Shop, scope: "today" | "upcoming") {
  await sweepOverdue({ shopId: shop.id });
  const db = await getDb();
  const now = clockNow();
  const today = dayKey(now);
  const s = await ar.getSettings(db, shop.id);
  const to = addDays(today, s.daysAhead);
  // مواعيد بعد مدّة الحجز الحالية (قصّرها الطبيب بعد الحجز) تبقى ظاهرة للسكرتيرة
  const last = scope === "upcoming" ? await ar.lastBookedDay(db, shop.id, today) : null;
  const listTo = scope === "today" ? today : last && last > to ? last : to;
  const [rows, counts, dayTickets] = await Promise.all([
    ar.listRange(db, shop.id, today, listTo),
    ar.activeCounts(db, shop.id, today, to),
    repo.listDayTickets(db, shop.id, today),
  ]);
  const walkIns = new Map<string, number>();
  for (const tk of dayTickets) if (tk.phone && OPEN_STATUSES.includes(tk.status)) walkIns.set(tk.phone, tk.number);
  const days = availability({ settings: s, shopHours: shop.hours, daysOff: shop.daysOff, now, counts, mode: "desk" });
  const none = new Map<string, number>();
  const items = rows.map((r) => staffRow(r, r.day === today ? walkIns : none));
  const todayItems = items.filter((x) => x.day === today);
  const byDay = new Map<string, StaffAppt[]>();
  if (scope === "upcoming") for (const it of items) byDay.set(it.day, [...(byDay.get(it.day) ?? []), it]);
  const grouped: StaffDay[] =
    scope === "today"
      ? []
      : days
          .filter((d) => d.state !== "closed" || byDay.has(d.day))
          .map((d) => ({ day: d.day, state: d.state, booked: d.booked, capacity: d.capacity, items: byDay.get(d.day) ?? [] }));
  let beyond = 0;
  for (const [day, list] of byDay) {
    if (day > to) {
      const booked = list.filter((x) => x.status === "booked" || x.status === "arrived").length;
      beyond += booked;
      grouped.push({ day, state: "open", booked, capacity: 0, items: list });
    }
  }
  return {
    enabled: s.enabled,
    active: isSubscriptionActive(shop, now),
    today,
    serverTime: now.toISOString(),
    /** الدقيقة الحالية بتوقيت الجزائر (لإبراز الموعد القادم) */
    nowMin: localTime(now).minutes,
    arrivalGraceMin: s.arrivalGraceMin,
    nextFree: firstFree(days),
    todayItems,
    summary: {
      booked: todayItems.filter((x) => x.status === "booked").length,
      arrived: todayItems.filter((x) => x.status === "arrived").length,
      noShows: todayItems.filter((x) => x.status === "no_show").length,
      upcoming: days.reduce((n, d) => n + (d.day === today ? 0 : d.booked), beyond),
    },
    days: grouped,
  };
}

export type StaffAppointments = Awaited<ReturnType<typeof staffAppointments>>;

/** الأوقات المتاحة للسكرتيرة (بلا مهلة الحجز المسبق، وحتى إن كان الحجز عبر الإنترنت معطّلاً). */
export async function deskAvailability(shop: Shop) {
  const db = await getDb();
  const now = clockNow();
  const today = dayKey(now);
  const s = await ar.getSettings(db, shop.id);
  const last = addDays(today, s.daysAhead);
  const [counts, full] = await Promise.all([ar.activeCounts(db, shop.id, today, last), fullReasons(db, shop, today, last)]);
  return {
    today,
    reason: activeReasonConfig(reasonConfigOf(shop)),
    /** الحالات المكتملة لكلّ يوم، وهل تتجاوزها السكرتيرة (بعد تنبيه) */
    full,
    override: limitsOf(shop).staffOverride,
    slotMin: s.slotMin,
    perSlot: s.perSlot,
    days: availability({ settings: s, shopHours: shop.hours, daysOff: shop.daysOff, now, counts, mode: "desk" }),
  };
}

export type DeskAvailability = Awaited<ReturnType<typeof deskAvailability>>;

export async function staffAppointmentAction(
  shop: Shop,
  body: { action?: unknown; id?: unknown; name?: unknown; phone?: unknown; day?: unknown; time?: unknown; reason?: unknown; force?: unknown },
): Promise<{ ok: true; id?: string; ticketId?: string; number?: number | null }> {
  const now = clockNow();
  // اشتراك منتهٍ: لا مواعيد جديدة ولا تذاكر من المكتب (كالحجز عبر الإنترنت وأخذ الأرقام)؛ الإلغاء يبقى ممكناً
  if ((body.action === "book" || body.action === "checkin") && !isSubscriptionActive(shop, now)) {
    throw new DomainError("subscription", 409);
  }
  switch (body.action) {
    case "book": {
      // موعد هاتفي أو عند المكتب: بلا رمز تحقّق، والهاتف اختياري (الكبار بلا هاتف)
      const name = cleanName(body.name);
      const phone = body.phone ? requirePhone(body.phone) : null;
      const s = await ar.getSettings(await getDb(), shop.id);
      const { day, time } = slotInput(body, s, now);
      const r = await bookCore(
        shop,
        { name, phone, day, time, reason: cleanReason(reasonConfigOf(shop), body.reason), lang: shop.defaultLang, source: "desk" },
        now,
        undefined,
        { staff: true, force: body.force === true },
      );
      return { ok: true, id: r.id };
    }
    case "checkin": {
      if (!ar.isUuid(body.id)) throw new DomainError("ap_not_found", 404);
      const r = await convert(shop, body.id, { arrived: true, staff: true });
      return { ok: true, ticketId: r.ticketId, number: r.number };
    }
    case "cancel": {
      const db = await getDb();
      const a = typeof body.id === "string" ? await ar.getAppointment(db, body.id) : null;
      if (!a || a.shopId !== shop.id) throw new DomainError("ap_not_found", 404);
      if (!(await ar.cancelAppointment(db, a.id, now))) throw new DomainError("ap_closed", 409);
      return { ok: true };
    }
    default:
      throw new DomainError("invalid_action");
  }
}

// ————————————————————————— الإعدادات (صاحب العيادة) —————————————————————————

export async function bookingSettingsView(shop: Shop) {
  const db = await getDb();
  return {
    settings: await ar.getSettings(db, shop.id),
    shopHours: shop.hours,
    verify: await verifyMode(shop.id),
    active: isSubscriptionActive(shop, clockNow()),
  };
}

export type BookingSettingsView = Awaited<ReturnType<typeof bookingSettingsView>>;

export async function saveBookingSettings(shop: Shop, body: Record<string, unknown>): Promise<BookingSettings> {
  const db = await getDb();
  const next: BookingSettings = { ...(await ar.getSettings(db, shop.id)) };
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") throw new DomainError("invalid_settings");
    next.enabled = body.enabled;
  }
  for (const [k, [min, max]] of Object.entries(BOOKING_LIMITS) as [BookingNumberKey, readonly [number, number]][]) {
    const v = body[k];
    if (v === undefined) continue;
    const n = Number(v);
    if (v === null || v === "" || !Number.isInteger(n) || n < min || n > max) throw new DomainError("invalid_settings");
    next[k] = n;
  }
  if (body.hours !== undefined) {
    if (body.hours === null) next.hours = null;
    else if (!isValidHours(body.hours)) throw new DomainError("invalid_settings");
    else next.hours = Object.fromEntries(Object.entries(body.hours as WeeklyHours).map(([k, v]) => [k, v.map(([a, b]) => [a, b])])) as WeeklyHours;
  }
  await ar.saveSettings(db, shop.id, next, clockNow());
  return next;
}
