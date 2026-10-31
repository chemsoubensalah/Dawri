"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { CalendarClock, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { ConfirmDialog } from "@/components/Dialog";
import { daysBetween, fmtDay } from "@/lib/domain/appointments";
import { parseHHMM } from "@/lib/domain/time";
import type { Lang } from "@/lib/domain/types";
import { errorText, t } from "@/lib/i18n";
import { api, ApiError, usePoll } from "@/lib/client";
import { printReceipt, receiptUrl } from "@/lib/print";
import type { StaffAppointments, StaffAppt } from "@/lib/server/appointments";
import DeskBookDialog from "./DeskBookDialog";
import { ApptRow } from "./parts";

export { ApptBadge } from "./parts";

export function whenLabel(lang: Lang, today: string, day: string, time: string) {
  const d = daysBetween(today, day);
  return `${d === 0 ? t(lang, "ap_today") : d === 1 ? t(lang, "ap_tomorrow") : fmtDay(lang, day, "short")} ${time}`;
}

/**
 * «مواعيد اليوم» في لوحة الطابور: «حضر» يعطي صاحب الموعد رقماً بأولوية فوراً.
 * يختفي إن كان الحجز معطّلاً ولا مواعيد اليوم.
 */
export default function TodayAppointments({ lang, slug, onQueueChange }: { lang: Lang; slug: string; onQueueChange?: () => void }) {
  const [s, setS] = useState<StaffAppointments | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [deskOpen, setDeskOpen] = useState(false);
  const [cancel, setCancel] = useState<StaffAppt | null>(null);
  const Chevron = lang === "ar" ? ChevronLeft : ChevronRight;

  usePoll(async () => {
    try {
      setS(await api<StaffAppointments>(`/api/staff/${slug}/appointments`));
    } catch (e) {
      if ((e as ApiError).status === 401) location.reload();
    }
  }, 15000);

  const act = useCallback(
    async (body: Record<string, unknown>, ok: (r: { number?: number | null }) => string) => {
      setBusy(true);
      setMsg(null);
      try {
        const r = await api<{ result: { number?: number | null }; state: StaffAppointments }>(`/api/staff/${slug}/appointments`, body);
        setS(r.state);
        setMsg({ ok: true, text: ok(r.result) });
        onQueueChange?.();
      } catch (e) {
        const err = e as ApiError;
        if (err.status === 401) location.reload();
        setMsg({ ok: false, text: errorText(lang, err.code) });
        api<StaffAppointments>(`/api/staff/${slug}/appointments`).then(setS).catch(() => {});
      } finally {
        setBusy(false);
      }
    },
    [slug, lang, onQueueChange],
  );

  if (!s || (!s.enabled && s.todayItems.length === 0)) return null;
  const items = s.todayItems;
  // الموعد القادم (أوّل محجوز لم تفُت مهلته) يُبرز
  const nextId = items.find((a) => a.status === "booked" && parseHHMM(a.time)! + s.arrivalGraceMin >= s.nowMin)?.id;

  return (
    <section className="card p-0" data-testid="today-appointments">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
        <h2 className="flex items-center gap-2 font-bold">
          <CalendarClock size={18} className="text-brand-600" /> {t(lang, "ap_todayTitle")}
          <span className="num rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{s.summary.booked + s.summary.arrived}</span>
        </h2>
        <button className="btn-secondary btn-sm" onClick={() => setDeskOpen(true)} data-testid="ap-add">
          <Plus size={15} /> {t(lang, "ap_add")}
        </button>
      </div>
      {msg && (
        <p className={`mx-4 mb-2 rounded-xl px-3 py-2 text-sm font-semibold ${msg.ok ? "bg-brand-50 text-brand-800" : "bg-rose-50 text-rose-700"}`} role="status">
          {msg.text}
        </p>
      )}
      {items.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-slate-500">{t(lang, "ap_emptyToday")}</p>
      ) : (
        <ul className="max-h-[26rem] divide-y divide-slate-100 overflow-y-auto">
          {items.map((a) => (
            <ApptRow
              key={a.id}
              lang={lang}
              a={a}
              today
              nowMin={s.nowMin}
              highlight={a.id === nextId}
              busy={busy}
              onCheckin={(x) => act({ action: "checkin", id: x.id }, (r) => t(lang, "ap_checkedIn", { n: r.number ?? "" }))}
              onCancel={setCancel}
              onPrint={(x) => printReceipt(receiptUrl(slug, { appt: x.id }))}
            />
          ))}
        </ul>
      )}
      <Link
        href={`/staff/${slug}/appointments`}
        className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm font-semibold text-brand-700 hover:bg-slate-50"
      >
        <span>{t(lang, "ap_all")}</span>
        <span className="flex items-center gap-1 text-xs font-medium text-slate-500">
          {s.nextFree ? (
            <>
              {t(lang, "ap_nextFree")}: <b className="num font-semibold text-slate-700">{whenLabel(lang, s.today, s.nextFree.day, s.nextFree.time)}</b>
            </>
          ) : (
            t(lang, "ap_noFree")
          )}
          <Chevron size={16} />
        </span>
      </Link>

      <DeskBookDialog
        lang={lang}
        slug={slug}
        scope="today"
        open={deskOpen}
        onClose={() => setDeskOpen(false)}
        onBooked={(state, label) => {
          setS(state);
          setMsg({ ok: true, text: label });
        }}
      />
      <ConfirmDialog
        open={cancel !== null}
        title={`${t(lang, "ap_cancel")} — ${cancel?.time ?? ""}`}
        body={`${cancel?.name ?? ""} · ${t(lang, "ap_cancelStaffBody")}`}
        confirmLabel={t(lang, "ap_cancel")}
        cancelLabel={t(lang, "db_back")}
        danger
        onConfirm={() => cancel && act({ action: "cancel", id: cancel.id }, () => t(lang, "ap_cancelDone"))}
        onClose={() => setCancel(null)}
        closeLabel={t(lang, "a11y_close")}
      />
    </section>
  );
}
