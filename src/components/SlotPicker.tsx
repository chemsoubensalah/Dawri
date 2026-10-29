"use client";
import { useEffect, useRef } from "react";
import { Moon, Sun } from "lucide-react";
import type { DayAvailability } from "@/lib/domain/appointments";
import type { Lang } from "@/lib/domain/types";
import { t } from "@/lib/i18n";

const wdFmt = (lang: Lang) => new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ" : "fr-DZ", { weekday: "short", timeZone: "UTC" });
const moFmt = (lang: Lang) => new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ" : "fr-DZ", { month: "short", timeZone: "UTC" });

/** «اليوم» / «غداً» / اسم اليوم */
export function dayName(lang: Lang, day: string, index: number): string {
  if (index === 0) return t(lang, "ap_today");
  if (index === 1) return t(lang, "ap_tomorrow");
  return wdFmt(lang).format(new Date(`${day}T12:00:00Z`));
}

/** شرائح الأيّام (تمرير أفقي) — اليوم المكتمل أو المغلق معطّل مع سببه. */
export function DayPills({
  lang,
  days,
  value,
  onChange,
  size = "md",
}: {
  lang: Lang;
  days: DayAvailability[];
  value: string | null;
  onChange: (day: string) => void;
  size?: "md" | "sm";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // اليوم المختار يبقى ظاهراً في الشريط (تمرير أفقي فقط — لا نحرّك الصفحة)
    const box = ref.current;
    const el = box?.querySelector<HTMLElement>("[aria-pressed=true]");
    if (!box || !el) return;
    const b = box.getBoundingClientRect();
    const e = el.getBoundingClientRect();
    if (e.left < b.left) box.scrollBy({ left: e.left - b.left - 8, behavior: "smooth" });
    else if (e.right > b.right) box.scrollBy({ left: e.right - b.right + 8, behavior: "smooth" });
  }, [value]);
  const mo = moFmt(lang);
  return (
    <div ref={ref} className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pt-1 pb-2 [scrollbar-width:none]" role="group" aria-label={t(lang, "ap_pickDay")}>
      {days.map((d, i) => {
        const on = d.day === value;
        const disabled = d.state !== "open";
        const date = new Date(`${d.day}T12:00:00Z`);
        const reason = d.state === "closed" ? t(lang, "ap_dayClosed") : d.state === "off" ? t(lang, "ap_dayOff") : d.state === "full" ? t(lang, "ap_dayFull") : d.state === "over" ? t(lang, "ap_dayOver") : null;
        return (
          <button
            type="button"
            key={d.day}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(d.day)}
            data-testid={`day-${d.day}`}
            className={`flex shrink-0 snap-start flex-col items-center rounded-2xl ${size === "sm" ? "w-[60px] py-2" : "w-[68px] py-2.5"} transition ${
              on
                ? "bg-brand-600 text-white shadow-(--shadow-brand)"
                : disabled
                  ? "bg-slate-50 text-slate-300 ring-1 ring-slate-100"
                  : "bg-white text-ink ring-1 ring-slate-200 hover:ring-brand-300"
            }`}
          >
            <span className={`max-w-full truncate px-1 text-[11px] leading-tight font-semibold ${on ? "text-brand-50" : disabled ? "" : "text-slate-500"}`}>
              {dayName(lang, d.day, i)}
            </span>
            <span className={`num ${size === "sm" ? "text-lg" : "text-2xl"} leading-tight font-bold`}>{date.getUTCDate()}</span>
            <span className={`text-[11px] leading-tight ${on ? "text-brand-100" : disabled ? "" : "text-slate-400"}`}>{reason ?? mo.format(date)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** شبكة الساعات مقسّمة: صباحاً / بعد الظهر. الوقت المأخوذ يبقى ظاهراً لكن معطّلاً. */
export function TimeGrid({
  lang,
  day,
  value,
  onChange,
  perSlot,
}: {
  lang: Lang;
  day: DayAvailability | null;
  value: string | null;
  onChange: (time: string) => void;
  perSlot: number;
}) {
  if (!day) return null;
  if (!day.slots.some((s) => s.left > 0)) {
    return <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-500">{t(lang, "ap_noSlots")}</p>;
  }
  const groups: [string, typeof day.slots, React.ReactNode][] = [
    [t(lang, "ap_morning"), day.slots.filter((s) => s.time < "12:00"), <Sun key="s" size={14} />],
    [t(lang, "ap_afternoon"), day.slots.filter((s) => s.time >= "12:00"), <Moon key="m" size={14} />],
  ];
  return (
    <div className="space-y-4">
      {groups
        .filter(([, list]) => list.length > 0)
        .map(([label, list, icon]) => (
          <div key={label}>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              {icon} {label}
            </div>
            <div className="grid grid-cols-4 gap-2" role="group" aria-label={label}>
              {list.map((s) => {
                const on = s.time === value;
                const taken = s.left <= 0;
                const last = !taken && perSlot > 1 && s.left === 1;
                return (
                  <button
                    type="button"
                    key={s.time}
                    disabled={taken}
                    aria-pressed={on}
                    onClick={() => onChange(s.time)}
                    data-testid={`time-${s.time}`}
                    title={last ? t(lang, "ap_lastSeat") : undefined}
                    className={`num relative rounded-xl py-2.5 text-[15px] font-bold transition ${
                      on
                        ? "bg-brand-600 text-white shadow-(--shadow-brand)"
                        : taken
                          ? "bg-slate-50 text-slate-300 line-through"
                          : "bg-white text-ink ring-1 ring-slate-200 hover:bg-brand-50 hover:ring-brand-300"
                    }`}
                  >
                    <span dir="ltr">{s.time}</span>
                    {last && !on && <span className="absolute top-1 size-1.5 rounded-full bg-amber-500 ltr:right-1 rtl:left-1" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}
