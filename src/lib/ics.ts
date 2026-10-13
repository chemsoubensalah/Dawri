/**
 * ملفّ تقويم iCalendar (RFC 5545) لموعد واحد، مع تذكير قبل ساعة.
 * الأوقات بالتوقيت العالمي (Z) فيعرضها كلّ هاتف بتوقيته.
 */

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** تهريب النصوص: \ ; , وأسطر جديدة */
export function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** طيّ الأسطر الطويلة عند 75 بايت دون قطع حرف عربي (UTF-8) من وسطه. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = out.length ? 74 : 75; // أسطر المتابعة تبدأ بمسافة
    if (bytes + b > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(e: {
  uid: string;
  now: Date;
  start: Date;
  end: Date;
  summary: string;
  location?: string | null;
  description?: string | null;
  url?: string | null;
  alarm: string;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dawri//Rendez-vous//AR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${utc(e.now)}`,
    `DTSTART:${utc(e.start)}`,
    `DTEND:${utc(e.end)}`,
    `SUMMARY:${icsText(e.summary)}`,
    ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
    ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT1H",
    `DESCRIPTION:${icsText(e.alarm)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** رابط «تقويم Google» (يفتح تطبيق التقويم على أندرويد مباشرة). */
export function googleCalendarUrl(e: { start: Date; end: Date; title: string; details?: string; location?: string | null }): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${utc(e.start)}/${utc(e.end)}`,
  });
  if (e.details) p.set("details", e.details);
  if (e.location) p.set("location", e.location);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
