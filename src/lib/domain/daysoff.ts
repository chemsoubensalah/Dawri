/**
 * أيّام العطل: أعياد وإجازات يحدّدها الطبيب — لا أرقام ولا مواعيد فيها.
 * دوالّ صافية؛ الأيّام "YYYY-MM-DD" بتوقيت الجزائر.
 */
import { addDays, isDayKey } from "./appointments";
import { DomainError, type DayOff } from "./types";

export const DAYS_OFF_MAX = 120;
export const DAY_OFF_LABEL_MAX = 60;
/** أطول فترة تُضاف دفعة واحدة (إجازة) */
export const DAYS_OFF_RANGE_MAX = 62;
/** لا عطل بعد سنتين من اليوم */
const HORIZON_DAYS = 730;

export function isDayOff(list: readonly DayOff[] | undefined, day: string): boolean {
  return Boolean(list?.some((d) => d.day === day));
}

/**
 * الأعياد الوطنية ذات التاريخ الثابت في الجزائر.
 * الأعياد الدينية (الفطر، الأضحى، رأس السنة الهجرية، عاشوراء، المولد) تتبع رؤية الهلال: يضيفها الطبيب يدوياً.
 */
export const DZ_FIXED_HOLIDAYS = [
  { md: "01-01", key: "do_h_newYear" },
  { md: "01-12", key: "do_h_yennayer" },
  { md: "05-01", key: "do_h_labour" },
  { md: "07-05", key: "do_h_independence" },
  { md: "11-01", key: "do_h_revolution" },
] as const;

export type FixedHolidayKey = (typeof DZ_FIXED_HOLIDAYS)[number]["key"];

/** المرّة القادمة لكلّ عيد ثابت (اليوم مشمول)، مرتّبة حسب التاريخ. */
export function upcomingFixedHolidays(today: string): { day: string; key: FixedHolidayKey }[] {
  const y = Number(today.slice(0, 4));
  return DZ_FIXED_HOLIDAYS.map((h) => {
    const day = `${y}-${h.md}`;
    return { day: day >= today ? day : `${y + 1}-${h.md}`, key: h.key };
  }).sort((a, b) => a.day.localeCompare(b.day));
}

function cleanLabel(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v !== "string") throw new DomainError("invalid_settings");
  // بلا محارف تحكّم أو اتّجاه مخفيّة
  const s = v.replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim();
  if (s.length > DAY_OFF_LABEL_MAX) throw new DomainError("invalid_settings");
  return s || null;
}

/** قائمة نظيفة: أيّام صحيحة من اليوم حتى سنتين، الماضي يُحذف، بلا تكرار (يبقى أوّل اسم)، مرتّبة. */
export function cleanDaysOff(v: unknown, today: string): DayOff[] {
  if (!Array.isArray(v)) throw new DomainError("invalid_settings");
  const last = addDays(today, HORIZON_DAYS);
  const byDay = new Map<string, DayOff>();
  for (const x of v) {
    const o = (x && typeof x === "object" ? x : null) as { day?: unknown; label?: unknown } | null;
    if (!o || !isDayKey(o.day) || o.day > last) throw new DomainError("invalid_settings");
    const label = cleanLabel(o.label);
    if (o.day < today || byDay.has(o.day)) continue;
    byDay.set(o.day, { day: o.day, label });
  }
  if (byDay.size > DAYS_OFF_MAX) throw new DomainError("days_off_too_many");
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** أيّام فترة (from..to مشمولان). */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length <= DAYS_OFF_RANGE_MAX; d = addDays(d, 1)) out.push(d);
  return out;
}
