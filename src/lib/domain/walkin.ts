/**
 * «يوم مفتوح»: أيّام (أسبوعية ثابتة و/أو تواريخ محدّدة) يختارها الطبيب لا يحجز فيها المريض موعداً بنفسه عبر الإنترنت.
 * الطابور يبقى مفتوحاً، والسكرتيرة وحدها تسجّل المواعيد (هاتفياً أو في العيادة). مطفأ افتراضياً.
 */
import { isDayKey, weekdayOf } from "./appointments";
import { DomainError } from "./types";

export interface WalkIn {
  /** 0 = الأحد … 6 = السبت */
  weekdays: number[];
  dates: string[];
}

export const WALKIN_DATES_MAX = 60;
export const NO_WALKIN: WalkIn = { weekdays: [], dates: [] };

/** الإعداد المحفوظ (قد يكون فارغاً أو تالفاً). */
export function readWalkIn(raw: unknown): WalkIn {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof WalkIn, unknown>>;
  const weekdays = Array.isArray(o.weekdays) ? [...new Set(o.weekdays.filter((x): x is number => Number.isInteger(x) && x >= 0 && x <= 6))] : [];
  const dates = Array.isArray(o.dates) ? [...new Set(o.dates.filter((x): x is string => isDayKey(x)))].sort().slice(0, WALKIN_DATES_MAX) : [];
  return { weekdays: weekdays.sort(), dates };
}

/** إعداد يرسله الطبيب: قيمة خاطئة ← رفض. */
export function cleanWalkIn(v: unknown): WalkIn {
  const o = (v && typeof v === "object" ? v : null) as Partial<Record<keyof WalkIn, unknown>> | null;
  if (!o || !Array.isArray(o.weekdays) || !Array.isArray(o.dates) || o.dates.length > WALKIN_DATES_MAX) throw new DomainError("invalid_settings");
  if (!o.weekdays.every((x) => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 6) || !o.dates.every((x) => isDayKey(x))) {
    throw new DomainError("invalid_settings");
  }
  return readWalkIn(o);
}

export const isWalkInDay = (w: WalkIn | undefined, day: string): boolean =>
  Boolean(w && (w.dates.includes(day) || w.weekdays.includes(weekdayOf(day))));
