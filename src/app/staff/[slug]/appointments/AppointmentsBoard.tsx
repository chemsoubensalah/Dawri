"use client";
import { useCallback, useEffect, useState } from "react";
import { CalendarCheck2, CalendarClock, CalendarPlus, CalendarRange, Copy, Link2, Settings, UserRoundX } from "lucide-react";
import { ConfirmDialog } from "@/components/Dialog";
import { Chip, Empty, Stat } from "@/components/ui";
import { daysBetween, fmtDay } from "@/lib/domain/appointments";
import { parseHHMM } from "@/lib/domain/time";
import type { Lang } from "@/lib/domain/types";
import { errorText, t, tn } from "@/lib/i18n";
import { api, ApiError, usePoll } from "@/lib/client";
import type { StaffAppointments, StaffAppt } from "@/lib/server/appointments";
import DeskBookDialog from "./DeskBookDialog";
import { ApptRow } from "./parts";
import { whenLabel } from "./TodayAppointments";

/** صفحة «المواعيد»: الأيّام القادمة يوماً بيوم، مع عدد المحجوز والسعة. */
export default function AppointmentsBoard({ lang, slug, initial }: { lang: Lang; slug: string; initial: StaffAppointments }) {
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [deskOpen, setDeskOpen] = useState(false);
  const [cancel, setCancel] = useState<StaffAppt | null>(null);
  const [copied, setCopied] = useState(false);
  const [bookingUrl, setBookingUrl] = useState(`/s/${slug}/book`);
  useEffect(() => setBookingUrl(`${location.origin}/s/${slug}/book`), [slug]);

  usePoll(async () => {
    try {
      setS(await api<StaffAppointments>(`/api/staff/${slug}/appointments?scope=upcoming`));
    } catch (e) {
      if ((e as ApiError).status === 401) location.reload();
    }
  }, 30000);

  const act = useCallback(
    async (body: Record<string, unknown>, ok: (r: { number?: number | null }) => string) => {
      setBusy(true);
      setMsg(null);
      try {
        const r = await api<{ result: { number?: number | null }; state: StaffAppointments }>(`/api/staff/${slug}/appointments?scope=upcoming`, body);
        setS(r.state);
        setMsg({ ok: true, text: ok(r.result) });
      } catch (e) {
        const err = e as ApiError;
        if (err.status === 401) location.reload();
        setMsg({ ok: false, text: errorText(lang, err.code) });
      } finally {
        setBusy(false);
      }
    },
    [slug, lang],
  );

  const total = s.days.reduce((n, d) => n + d.items.length, 0);
  const nextId = s.todayItems.find((a) => a.status === "booked" && parseHHMM(a.time)! + s.arrivalGraceMin >= s.nowMin)?.id;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <CalendarClock size={24} className="text-brand-600" /> {t(lang, "ap_nav")}
          </h1>
          <p className="mt-0.5 max-w-xl text-sm text-slate-600">{t(lang, "ap_pageSub")}</p>
        </div>
        <button className="btn-primary" onClick={() => setDeskOpen(true)} data-testid="ap-add-page">
          <CalendarPlus size={18} /> {t(lang, "ap_addTitle")}
        </button>
      </div>

      {!s.enabled && (
        <a
          href={`/staff/${slug}/settings#booking`}
          className="flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-900 ring-1 ring-amber-200"
          data-testid="booking-disabled"
        >
          <Settings size={18} className="shrink-0" />
          <span className="min-w-0 flex-1">{t(lang, "ap_disabledBanner")}</span>
          <span className="shrink-0 underline">{t(lang, "ap_enable")}</span>
        </a>
      )}
      {s.enabled && !s.active && (
        <p className="rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-800 ring-1 ring-rose-200">{t(lang, "ap_se_inactive")}</p>
      )}

      <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat icon={<CalendarCheck2 size={13} />} label={t(lang, "ap_statToday")} value={s.summary.booked + s.summary.arrived} />
        <Stat icon={<CalendarRange size={13} />} label={t(lang, "ap_statUpcoming")} value={s.summary.upcoming} />
        <Stat icon={<UserRoundX size={13} />} label={t(lang, "ap_statNoShow")} value={s.summary.noShows} />
        <Stat
          icon={<CalendarPlus size={13} />}
          label={t(lang, "ap_nextFree")}
          value={<span className="text-base">{s.nextFree ? whenLabel(lang, s.today, s.nextFree.day, s.nextFree.time) : t(lang, "ap_noFree")}</span>}
        />
      </section>

      {s.enabled && (
        <section className="card flex flex-wrap items-center gap-3 p-4">
          <span className="flex items-center gap-2 text-sm font-bold">
            <Link2 size={17} className="text-brand-600" /> {t(lang, "ap_bookingLink")}
          </span>
          <span className="min-w-0 flex-1 truncate rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200" dir="ltr">
            {bookingUrl.replace(/^https?:\/\//, "")}
          </span>
          <span className="flex gap-2">
            <button
              className="btn-secondary btn-sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(bookingUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {}
              }}
            >
              <Copy size={14} /> {copied ? "✓" : t(lang, "db_copy")}
            </button>
            <a
              className="btn btn-sm bg-[#128C7E] text-white hover:bg-[#0e6f64]"
              href={`https://wa.me/?text=${encodeURIComponent(`${t(lang, "ap_bookTitle")}: ${bookingUrl}`)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp
            </a>
          </span>
        </section>
      )}

      {msg && (
        <p className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${msg.ok ? "bg-brand-50 text-brand-800" : "bg-rose-50 text-rose-700"}`} role="status">
          {msg.text}
        </p>
      )}

      {total === 0 ? (
        <section className="card">
          <Empty icon={<CalendarClock size={40} />} title={t(lang, "ap_noUpcoming")} sub={t(lang, "ap_noUpcomingHint")} />
        </section>
      ) : null}

      <div className="space-y-3">
        {s.days.map((d) => {
          const offset = daysBetween(s.today, d.day);
          const title = offset === 0 ? `${t(lang, "ap_today")} — ${fmtDay(lang, d.day)}` : offset === 1 ? `${t(lang, "ap_tomorrow")} — ${fmtDay(lang, d.day)}` : fmtDay(lang, d.day);
          const pct = d.capacity > 0 ? Math.min(100, Math.round((d.booked / d.capacity) * 100)) : 0;
          if (d.items.length === 0) {
            if (total === 0) return null;
            return (
              <div key={d.day} className="flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-2.5 text-sm ring-1 ring-slate-200/70">
                <span className="font-semibold text-slate-600">{title}</span>
                <span className="ms-auto text-xs text-slate-400">{d.state === "closed" ? t(lang, "ap_dayClosed") : d.state === "off" ? t(lang, "ap_dayOff") : t(lang, "ap_dayEmpty")}</span>
              </div>
            );
          }
          return (
            <section key={d.day} className="card p-0" data-testid={`ap-day-${d.day}`}>
              <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-3">
                <h2 className="font-bold">{title}</h2>
                <Chip tone={d.state === "full" ? "amber" : "green"}>{tn(lang, "ap_countN", d.booked)}</Chip>
                {d.capacity > 0 && (
                  <span className="ms-auto flex items-center gap-2 text-xs text-slate-500">
                    <span className="num" dir="ltr">
                      {d.booked}/{d.capacity}
                    </span>
                    <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                      <span className={`block h-full rounded-full ${pct >= 100 ? "bg-amber-500" : "bg-brand-500"}`} style={{ width: `${pct}%` }} />
                    </span>
                  </span>
                )}
              </div>
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {d.items.map((a) => (
                  <ApptRow
                    key={a.id}
                    lang={lang}
                    a={a}
                    today={offset === 0}
                    nowMin={s.nowMin}
                    highlight={a.id === nextId}
                    busy={busy}
                    onCheckin={(x) => act({ action: "checkin", id: x.id }, (r) => t(lang, "ap_checkedIn", { n: r.number ?? "" }))}
                    onCancel={setCancel}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <DeskBookDialog
        lang={lang}
        slug={slug}
        scope="upcoming"
        open={deskOpen}
        onClose={() => setDeskOpen(false)}
        onBooked={(state, label) => {
          setS(state);
          setMsg({ ok: true, text: label });
        }}
      />
      <ConfirmDialog
        open={cancel !== null}
        title={`${t(lang, "ap_cancel")} — ${cancel ? `${fmtDay(lang, cancel.day, "short")} ${cancel.time}` : ""}`}
        body={`${cancel?.name ?? ""} · ${t(lang, "ap_cancelStaffBody")}`}
        confirmLabel={t(lang, "ap_cancel")}
        cancelLabel={t(lang, "db_back")}
        danger
        onConfirm={() => cancel && act({ action: "cancel", id: cancel.id }, () => t(lang, "ap_cancelDone"))}
        onClose={() => setCancel(null)}
        closeLabel={t(lang, "a11y_close")}
      />
    </div>
  );
}
