/**
 * المواعيد — دوالّ صافية (بلا قاعدة بيانات): شبكة الأوقات، الأماكن المتبقّية، نوافذ الوصول والإلغاء.
 * كلّ الأيّام "YYYY-MM-DD" وكلّ الأوقات "HH:MM" بتوقيت الجزائر (UTC+1 طوال السنة، بلا توقيت صيفي).
 */
import { localTime, parseHHMM } from "./time";
import type { Lang, WeeklyHours } from "./types";

export type ApptStatus = "booked" | "cancelled" | "arrived" | "no_show";
export type ApptSource = "online" | "desk";

export interface Appointment {
  id: string;
  shopId: string;
  day: string;
  time: string;
  name: string;
  phone: string | null;
  lang: Lang;
  source: ApptSource;
  status: ApptStatus;
  ticketId: string | null;
  createdAt: Date;
  cancelledAt: Date | null;
  arrivedAt: Date | null;
}

export interface BookingSettings {
  /** الحجز عبر الإنترنت للمرضى (السكرتيرة تسجّل مواعيد هاتفية دائماً). */
  enabled: boolean;
  /** طول الموعد بالدقائق. */
  slotMin: number;
  /** عدد المرضى في نفس الوقت. */
  perSlot: number;
  /** كم يوماً مسبقاً يمكن الحجز. */
  daysAhead: number;
  /** أقلّ مدّة بين الحجز والموعد (دقائق). */
  minLeadMin: number;
  /** ساعات المواعيد؛ null = نفس ساعات أخذ الأرقام. */
  hours: WeeklyHours | null;
  /** أقصى عدد مواعيد في اليوم (0 = بلا حدّ). */
  dailyMax: number;
  /** بعد وقت الموعد بكم دقيقة يُعتبر غائباً. */
  arrivalGraceMin: number;
}

export const DEFAULT_BOOKING: BookingSettings = {
  enabled: false,
  slotMin: 15,
  perSlot: 1,
  daysAhead: 14,
  minLeadMin: 30,
  hours: null,
  dailyMax: 0,
  arrivalGraceMin: 20,
};

export const BOOKING_LIMITS = {
  slotMin: [5, 120],
  perSlot: [1, 10],
  daysAhead: [1, 60],
  minLeadMin: [0, 1440],
  dailyMax: [0, 500],
  arrivalGraceMin: [0, 120],
} as const satisfies Record<string, readonly [number, number]>;

export type BookingNumberKey = keyof typeof BOOKING_LIMITS;

/** زرّ «وصلت» يُفتح قبل الموعد بهذه الدقائق. */
export const CHECKIN_EARLY_MIN = 60;
/** أقصى عدد مواعيد قادمة لنفس الهاتف عبر الإنترنت (ضدّ حجز الأوقات كلّها). */
export const MAX_UPCOMING_PER_PHONE = 3;
/** أقصى عدد حجوزات عبر الإنترنت في الساعة لكلّ عيادة (ضدّ الإغراق الآلي). */
export const MAX_ONLINE_PER_HOUR = 100;
/** يُمحى اسم وهاتف الموعد بعد هذه المدّة من تاريخه. */
export const APPT_RETENTION_DAYS = 30;

/** الجزائر = UTC+1 طوال السنة. */
const ALGIERS_OFFSET_MS = 60 * 60_000;

export function isTimeKey(v: unknown): v is string {
  return typeof v === "string" && parseHHMM(v) !== null;
}

function parts(day: string): [number, number, number] {
  const [y, m, d] = day.split("-").map(Number);
  return [y, m, d];
}

/** "YYYY-MM-DD" صالح فعلاً (لا 2026-02-31). */
export function isDayKey(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = parts(v);
  const t = new Date(Date.UTC(y, m - 1, d, 12));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = parts(day);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
}

/** 0=الأحد … 6=السبت */
export function weekdayOf(day: string): number {
  const [y, m, d] = parts(day);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

export function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** لحظة بداية الموعد (للتقويم وللمقارنات المطلقة). */
export function slotInstant(day: string, time: string): Date {
  const [y, m, d] = parts(day);
  return new Date(Date.UTC(y, m - 1, d, 0, parseHHMM(time)!) - ALGIERS_OFFSET_MS);
}

export function bookingHours(b: BookingSettings, shopHours: WeeklyHours): WeeklyHours {
  return b.hours ?? shopHours;
}

/** أوقات يوم واحد: كلّ فترة تُقسَّم إلى مواعيد بطول slotMin تنتهي قبل إغلاقها. */
export function daySlots(hours: WeeklyHours, day: string, slotMin: number): string[] {
  const set = new Set<number>();
  for (const [a, b] of hours[String(weekdayOf(day))] ?? []) {
    const start = parseHHMM(a);
    const end = parseHHMM(b);
    if (start === null || end === null) continue;
    for (let t = start; t + slotMin <= end; t += slotMin) set.add(t);
  }
  return [...set].sort((x, y) => x - y).map(hhmm);
}

/**
 * الموعد من الشبكة الذي يقع فيه هذا الوقت. إن غيّر الطبيب طول الموعد بعد الحجز
 * يبقى الحجز القديم محسوباً في الموعد الذي يغطّيه (فلا حجز مزدوج).
 */
export function bucketOf(grid: string[], time: string, slotMin: number): string | null {
  const m = parseHHMM(time);
  if (m === null) return null;
  for (const s of grid) {
    const a = parseHHMM(s)!;
    if (m >= a && m < a + slotMin) return s;
  }
  return null;
}

export type DayState = "open" | "closed" | "full" | "over";

export interface DayAvailability {
  day: string;
  weekday: number;
  /** open = فيه أوقات متاحة، closed = لا عمل، full = اكتمل، over = انتهت أوقات اليوم */
  state: DayState;
  /** المواعيد النشطة المحجوزة في هذا اليوم */
  booked: number;
  /** السعة: عدد الأماكن الكلّي (بعد الحدّ اليومي) */
  capacity: number;
  slots: { time: string; left: number }[];
}

export interface SlotCount {
  day: string;
  time: string;
  n: number;
}

/**
 * الأيّام والأوقات المتاحة من اليوم حتى اليوم + daysAhead.
 * online: يُستثنى كلّ وقت يبدأ قبل (الآن + minLeadMin) بالوقت المطلق — في أيّ يوم، لا اليوم فقط
 * (مهلة 24 ساعة مساءً تستثني صباح الغد، و30 دقيقة قبل منتصف الليل تستثني أوّل الليل)،
 * وأوقات اليوم إن أُغلق طابور اليوم.
 * desk (السكرتيرة): يُستثنى ما مضى فقط.
 */
export function availability(o: {
  settings: BookingSettings;
  shopHours: WeeklyHours;
  now: Date;
  counts: SlotCount[];
  mode: "online" | "desk";
  closedToday?: boolean;
  onlyDay?: string;
}): DayAvailability[] {
  const s = o.settings;
  const hours = bookingHours(s, o.shopHours);
  const lt = localTime(o.now);
  // بداية الدقيقة الحالية (كما في lt.minutes) + المهلة
  const leadUntil = Math.floor(o.now.getTime() / 60_000) * 60_000 + s.minLeadMin * 60_000;
  const byDay = new Map<string, SlotCount[]>();
  for (const c of o.counts) {
    const list = byDay.get(c.day) ?? [];
    list.push(c);
    byDay.set(c.day, list);
  }
  const out: DayAvailability[] = [];
  for (let i = 0; i <= s.daysAhead; i++) {
    const day = addDays(lt.day, i);
    if (o.onlyDay && day !== o.onlyDay) continue;
    const grid = daySlots(hours, day, s.slotMin);
    const counts = byDay.get(day) ?? [];
    const perBucket = new Map<string, number>();
    let booked = 0;
    for (const c of counts) {
      booked += c.n;
      const b = bucketOf(grid, c.time, s.slotMin);
      if (b) perBucket.set(b, (perBucket.get(b) ?? 0) + c.n);
    }
    const gridCap = grid.length * s.perSlot;
    const capacity = s.dailyMax > 0 ? Math.min(gridCap, s.dailyMax) : gridCap;
    const dayFull = s.dailyMax > 0 && booked >= s.dailyMax;
    const bookable = (t: string): boolean => {
      if (o.mode === "online") return !(i === 0 && o.closedToday) && slotInstant(day, t).getTime() >= leadUntil;
      return i > 0 || parseHHMM(t)! >= lt.minutes;
    };
    const slots = grid
      .filter(bookable)
      .map((t) => ({ time: t, left: dayFull ? 0 : Math.max(0, s.perSlot - (perBucket.get(t) ?? 0)) }));
    const state: DayState = !grid.length
      ? "closed"
      : dayFull
        ? "full"
        : !slots.length
          ? "over"
          : slots.every((x) => x.left === 0)
            ? "full"
            : "open";
    out.push({ day, weekday: weekdayOf(day), state, booked, capacity, slots });
  }
  return out;
}

/** هل يمكن حجز هذا الوقت؟ */
export function slotVerdict(days: DayAvailability[], day: string, time: string): "ok" | "invalid" | "unavailable" | "day_full" {
  const d = days.find((x) => x.day === day);
  if (!d) return "invalid"; // خارج مدّة الحجز
  const slot = d.slots.find((x) => x.time === time);
  if (!slot) return "unavailable"; // ليس في الشبكة، أو مضى، أو قريب جدّاً
  if (slot.left > 0) return "ok";
  return d.booked >= d.capacity ? "day_full" : "unavailable";
}

export type CheckinWindow = "early" | "open" | "late";

/** نافذة «وصلت»: من ساعة قبل الموعد حتى arrivalGraceMin بعده، يوم الموعد فقط. */
export function checkinWindow(a: { day: string; time: string }, graceMin: number, now: Date): CheckinWindow {
  const lt = localTime(now);
  if (a.day !== lt.day) return a.day > lt.day ? "early" : "late";
  const m = parseHHMM(a.time)!;
  if (lt.minutes < m - CHECKIN_EARLY_MIN) return "early";
  if (lt.minutes > m + graceMin) return "late";
  return "open";
}

/** موعد محجوز فات وقته + المهلة دون وصول ← غائب. */
export function isOverdue(a: { day: string; time: string }, graceMin: number, now: Date): boolean {
  return checkinWindow(a, graceMin, now) === "late";
}

/** يستطيع المريض الإلغاء حتى بداية الموعد. */
export function beforeSlot(a: { day: string; time: string }, now: Date): boolean {
  const lt = localTime(now);
  if (a.day !== lt.day) return a.day > lt.day;
  return lt.minutes < parseHHMM(a.time)!;
}

/** «الأحد 12 أكتوبر» — شهور الجزائر (جانفي، فيفري…) بالعربية. */
export function fmtDay(lang: Lang, day: string, style: "long" | "short" = "long"): string {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ" : "fr-DZ", {
    weekday: style === "long" ? "long" : "short",
    day: "numeric",
    month: style === "long" ? "long" : "short",
    timeZone: "UTC",
    numberingSystem: "latn",
  }).format(new Date(`${day}T12:00:00Z`));
}

/** للشرائح: اسم الشهر المختصر فقط */
export function fmtMonth(lang: Lang, day: string): string {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ" : "fr-DZ", { month: "short", timeZone: "UTC" }).format(
    new Date(`${day}T12:00:00Z`),
  );
}

/** الفرق بالأيّام بين يومين (b - a). */
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = parts(a);
  const [y2, m2, d2] = parts(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}
