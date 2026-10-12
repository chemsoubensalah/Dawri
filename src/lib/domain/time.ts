import type { Interval, WeeklyHours } from "./types";

export const TIME_ZONE = "Africa/Algiers";

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface LocalTime {
  /** "YYYY-MM-DD" بتوقيت الجزائر */
  day: string;
  weekday: number;
  /** الدقائق منذ منتصف الليل */
  minutes: number;
}

export function localTime(d: Date): LocalTime {
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) parts[p.type] = p.value;
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS[parts.weekday],
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function dayKey(d: Date): string {
  return localTime(d).day;
}

export function parseHHMM(s: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function isValidHours(h: unknown): h is WeeklyHours {
  if (!h || typeof h !== "object" || Array.isArray(h)) return false;
  for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
    if (!/^[0-6]$/.test(k) || !Array.isArray(v) || v.length > 3) return false;
    for (const iv of v) {
      if (!Array.isArray(iv) || iv.length !== 2) return false;
      const a = parseHHMM(String(iv[0]));
      const b = parseHHMM(String(iv[1]));
      if (a === null || b === null || a >= b) return false;
    }
  }
  return true;
}

/** هل تُقبل التذاكر الآن حسب ساعات العمل؟ */
export function isWithinHours(hours: WeeklyHours, now: Date): boolean {
  const t = localTime(now);
  const intervals: Interval[] = hours[String(t.weekday)] ?? [];
  return intervals.some(([open, close]) => {
    const a = parseHHMM(open)!;
    const b = parseHHMM(close)!;
    return t.minutes >= a && t.minutes < b;
  });
}

/**
 * خارج الساعات الآن: متى يُفتح أخذ الأرقام اليوم؟
 * afterBreak = كانت هناك فترة قبلها اليوم (استراحة) وليس افتتاح اليوم.
 */
export function nextOpeningToday(hours: WeeklyHours, now: Date): { at: string; afterBreak: boolean } | null {
  const t = localTime(now);
  const intervals: Interval[] = hours[String(t.weekday)] ?? [];
  let next: Interval | null = null;
  let afterBreak = false;
  for (const iv of intervals) {
    const a = parseHHMM(iv[0])!;
    const b = parseHHMM(iv[1])!;
    if (t.minutes >= a && t.minutes < b) return null; // مفتوح الآن
    if (b <= t.minutes) afterBreak = true;
    if (a > t.minutes && (!next || a < parseHHMM(next[0])!)) next = iv;
  }
  return next ? { at: next[0], afterBreak } : null;
}

/** السبت–الخميس 06:00–16:00، الجمعة مغلق. */
export const DEFAULT_HOURS: WeeklyHours = {
  "6": [["06:00", "16:00"]],
  "0": [["06:00", "16:00"]],
  "1": [["06:00", "16:00"]],
  "2": [["06:00", "16:00"]],
  "3": [["06:00", "16:00"]],
  "4": [["06:00", "16:00"]],
  "5": [],
};

export function minutesBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 60000;
}
