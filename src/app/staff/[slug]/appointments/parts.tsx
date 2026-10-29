"use client";
import { CalendarCheck2, Globe, Phone, Stethoscope, UserCheck, X } from "lucide-react";
import { Chip } from "@/components/ui";
import { parseHHMM } from "@/lib/domain/time";
import type { Lang } from "@/lib/domain/types";
import { reasonText, t } from "@/lib/i18n";
import type { StaffAppt } from "@/lib/server/appointments";

/** شارة «موعد» على تذكرة صاحب الموعد في الطابور. */
export function ApptBadge({ lang }: { lang: Lang }) {
  return (
    <Chip tone="violet">
      <CalendarCheck2 size={12} /> {t(lang, "ap_badge")}
    </Chip>
  );
}

/** سبب الزيارة الذي اختاره المريض (طابور ومواعيد). */
export function ReasonChip({ lang, reason }: { lang: Lang; reason: string | null | undefined }) {
  const text = reasonText(lang, reason);
  if (!text) return null;
  return (
    <Chip className="font-semibold">
      <Stethoscope size={12} /> {text}
    </Chip>
  );
}

function StatusChip({ lang, a, late }: { lang: Lang; a: StaffAppt; late: boolean }) {
  if (a.status === "arrived")
    return (
      <Chip tone="green">
        <UserCheck size={12} /> {a.ticketNumber !== null ? `${t(lang, "ap_st_arrived")} · ${t(lang, "ap_ticketN", { n: a.ticketNumber })}` : t(lang, "ap_st_arrived")}
      </Chip>
    );
  if (a.status === "no_show") return <Chip tone="rose">{t(lang, "ap_st_no_show")}</Chip>;
  if (a.status === "cancelled") return <Chip>{t(lang, "ap_st_cancelled")}</Chip>;
  if (late) return <Chip tone="amber">{t(lang, "ap_late")}</Chip>;
  return null;
}

/** سطر موعد (لوحة الطابور وصفحة المواعيد). */
export function ApptRow({
  lang,
  a,
  today,
  nowMin,
  highlight = false,
  busy,
  onCheckin,
  onCancel,
}: {
  lang: Lang;
  a: StaffAppt;
  today: boolean;
  nowMin: number;
  highlight?: boolean;
  busy: boolean;
  onCheckin: (a: StaffAppt) => void;
  onCancel: (a: StaffAppt) => void;
}) {
  const late = today && a.status === "booked" && nowMin > parseHHMM(a.time)!;
  const closed = a.status === "cancelled" || a.status === "no_show";
  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${highlight ? "bg-brand-50/60" : ""}`} data-testid={`appt-${a.time}`}>
      <span className={`num w-14 shrink-0 text-center text-lg font-bold ${closed ? "text-slate-300" : "text-ink"}`} dir="ltr">
        {a.time}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`flex items-center gap-1.5 font-semibold ${a.status === "cancelled" ? "text-slate-400 line-through" : ""}`}>
          <span className="truncate">{a.name}</span>
          {a.source === "desk" ? (
            <Phone size={12} className="shrink-0 text-slate-400" aria-label={t(lang, "ap_src_desk")} />
          ) : (
            <Globe size={12} className="shrink-0 text-slate-400" aria-label={t(lang, "ap_src_online")} />
          )}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {a.phone && (
            <a href={`tel:${a.phone.replace(/\s/g, "")}`} className="num text-xs text-slate-500 hover:text-brand-700" dir="ltr">
              {a.phone}
            </a>
          )}
          <ReasonChip lang={lang} reason={a.reason} />
          <StatusChip lang={lang} a={a} late={late} />
          {a.walkIn !== null && <Chip tone="sky">{t(lang, "ap_walkIn", { n: a.walkIn })}</Chip>}
        </span>
      </span>
      <span className="flex shrink-0 gap-1">
        {today && (a.status === "booked" || a.status === "no_show") && (
          <button className="btn-primary btn-sm" onClick={() => onCheckin(a)} disabled={busy} data-testid="appt-staff-checkin">
            <UserCheck size={15} /> {t(lang, "ap_checkin")}
          </button>
        )}
        {a.status === "booked" && (
          <button
            className="inline-flex size-9 items-center justify-center rounded-xl text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50"
            onClick={() => onCancel(a)}
            disabled={busy}
            title={t(lang, "ap_cancel")}
            aria-label={`${t(lang, "ap_cancel")} ${a.time}`}
          >
            <X size={17} />
          </button>
        )}
      </span>
    </li>
  );
}
