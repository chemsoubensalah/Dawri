/**
 * «حدود التسجيل» يقرّرها الطبيب (الإعدادات ← «حدود التسجيل»):
 *  - مهلة بين تسجيلين لنفس الهاتف: N يوماً تُحسب من يوم التسجيل، للمواعيد فقط أو للمواعيد والطابور.
 *  - هل تتجاوز السكرتيرة الحدود (بعد تنبيه)؛ المريض من هاتفه لا يتجاوزها أبداً.
 * الحدّ اليوميّ لكلّ حالة (حشو: 6) يُكتب بجانب اختيارات «سبب الزيارة» — reasons.ts (caps).
 * التطبيق في src/lib/server/limits.ts.
 */
import { addDays } from "./appointments";
import { DomainError } from "./types";

/** appts = المواعيد فقط؛ all = المواعيد والطابور (أخذ رقم) */
export type PhoneScope = "appts" | "all";

export interface LimitsConfig {
  /** 0 = بلا مهلة. من سجّل يوم X لا يسجّل من جديد قبل X + N */
  phoneDays: number;
  phoneScope: PhoneScope;
  /** السكرتيرة (ولوحة الطبيب) تضيف رغم الحدّ بعد تنبيه */
  staffOverride: boolean;
}

/** الهاتف يُمحى بعد 30 يوماً (التذاكر والمواعيد): لا مهلة أطول */
export const PHONE_DAYS_MAX = 30;

export const DEFAULT_LIMITS: LimitsConfig = { phoneDays: 0, phoneScope: "appts", staffOverride: true };

/** الإعداد المحفوظ (قد يكون فارغاً) + القيم الافتراضية. */
export function readLimits(raw: unknown): LimitsConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof LimitsConfig, unknown>>;
  const days = Number(o.phoneDays);
  return {
    phoneDays: Number.isInteger(days) && days >= 0 && days <= PHONE_DAYS_MAX ? days : DEFAULT_LIMITS.phoneDays,
    phoneScope: o.phoneScope === "all" || o.phoneScope === "appts" ? o.phoneScope : DEFAULT_LIMITS.phoneScope,
    staffOverride: typeof o.staffOverride === "boolean" ? o.staffOverride : DEFAULT_LIMITS.staffOverride,
  };
}

/** إعداد يرسله الطبيب من صفحة الإعدادات. */
export function cleanLimits(v: unknown): LimitsConfig {
  const o = (v && typeof v === "object" ? v : null) as Partial<Record<keyof LimitsConfig, unknown>> | null;
  const days = typeof o?.phoneDays === "string" ? Number(o.phoneDays) : o?.phoneDays;
  if (
    !o ||
    !Number.isInteger(days) ||
    (days as number) < 0 ||
    (days as number) > PHONE_DAYS_MAX ||
    (o.phoneScope !== "appts" && o.phoneScope !== "all") ||
    typeof o.staffOverride !== "boolean"
  ) {
    throw new DomainError("invalid_settings");
  }
  return { phoneDays: days as number, phoneScope: o.phoneScope, staffOverride: o.staffOverride };
}

/** أوّل يوم يُسمح فيه بتسجيل جديد بعد آخر تسجيل في `last` (null = مسموح اليوم). */
export function phoneWaitUntil(c: LimitsConfig, last: string | null, today: string): string | null {
  if (!c.phoneDays || !last) return null;
  const until = addDays(last, c.phoneDays);
  return until > today ? until : null;
}
