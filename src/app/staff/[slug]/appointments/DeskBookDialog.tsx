"use client";
import { useEffect, useState } from "react";
import { CalendarDays, CalendarPlus, GalleryHorizontal, Loader2, Printer } from "lucide-react";
import Dialog from "@/components/Dialog";
import ReasonPicker from "@/components/ReasonPicker";
import { DayCalendar, DayPills, TimeGrid } from "@/components/SlotPicker";
import { fmtDay } from "@/lib/domain/appointments";
import type { Lang } from "@/lib/domain/types";
import { errorText, t } from "@/lib/i18n";
import { api, ApiError } from "@/lib/client";
import { autoPrint, printReceipt, receiptUrl, setAutoPrint } from "@/lib/print";
import type { DeskAvailability, StaffAppointments } from "@/lib/server/appointments";

/** موعد هاتفي أو عند المكتب: الاسم، الهاتف (اختياري)، اليوم والساعة من الأوقات الحرّة. بلا رمز تحقّق. */
export default function DeskBookDialog({
  lang,
  slug,
  scope,
  open,
  onClose,
  onBooked,
}: {
  lang: Lang;
  slug: string;
  scope: "today" | "upcoming";
  open: boolean;
  onClose: () => void;
  onBooked: (state: StaffAppointments, label: string) => void;
}) {
  const [av, setAv] = useState<DeskAvailability | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** حدّ الطبيب بلغ (حالة مكتملة، أو مهلة الهاتف) ويُسمح للسكرتيرة بالتجاوز */
  const [canForce, setCanForce] = useState(false);
  /** ورقة الموعد بعد الحجز (إعداد هذا الجهاز) */
  const [printAfter, setPrintAfter] = useState(false);
  useEffect(() => setPrintAfter(autoPrint("appt")), []);
  /** التقويم الشهري أو شريط الأيّام (اختيار السكرتيرة يُحفظ على هذا الجهاز) */
  const [calendar, setCalendar] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem("dawri:deskDays");
      if (v) setCalendar(v === "calendar");
    } catch {}
  }, []);
  const toggleCalendar = (on: boolean) => {
    setCalendar(on);
    try {
      localStorage.setItem("dawri:deskDays", on ? "calendar" : "strip");
    } catch {}
  };

  useEffect(() => {
    if (!open) return;
    setError("");
    setTime(null);
    let alive = true;
    api<DeskAvailability>(`/api/staff/${slug}/appointments/slots`)
      .then((r) => {
        if (!alive) return;
        setAv(r);
        setDay((d) => (d && r.days.some((x) => x.day === d && x.state === "open") ? d : (r.days.find((x) => x.state === "open")?.day ?? null)));
      })
      .catch((e) => {
        if ((e as ApiError).status === 401) location.reload();
        setError(errorText(lang, (e as ApiError).code));
      });
    return () => {
      alive = false;
    };
  }, [open, slug, lang]);

  // التجاوز يخصّ الطلب الذي نُبِّه عليه فقط: أيّ تغيير يعيد التنبيه
  useEffect(() => setCanForce(false), [day, time, phone, reason]);

  const submit = async (force = false) => {
    if (!day || !time) return;
    setBusy(true);
    setError("");
    setCanForce(false);
    try {
      const r = await api<{ result: { id?: string }; state: StaffAppointments }>(`/api/staff/${slug}/appointments?scope=${scope}`, {
        action: "book",
        name,
        phone: phone || undefined,
        reason,
        day,
        time,
        force,
      });
      onBooked(r.state, `${t(lang, "ap_booked")} — ${fmtDay(lang, day)} ${time}`);
      if (printAfter && r.result.id) printReceipt(receiptUrl(slug, { appt: r.result.id }));
      setName("");
      setPhone("");
      setReason(null);
      setTime(null);
      onClose();
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) location.reload();
      setError(errorText(lang, err.code, err.vars, true));
      setCanForce(err.vars?.override === 1);
      if (err.code === "ap_slot_unavailable" || err.code === "ap_day_full") {
        setTime(null);
        api<DeskAvailability>(`/api/staff/${slug}/appointments/slots`).then(setAv).catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  };

  const selected = av?.days.find((d) => d.day === day) ?? null;
  return (
    <Dialog open={open} onClose={onClose} title={t(lang, "ap_addTitle")} closeLabel={t(lang, "a11y_close")} wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="text-sm text-slate-600">{t(lang, "ap_addHint")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ap-name">{t(lang, "name")}</label>
            <input id="ap-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60} autoFocus data-testid="ap-name" />
          </div>
          <div>
            <label className="label" htmlFor="ap-phone">{t(lang, "phoneOptional")}</label>
            <input id="ap-phone" className="input num text-start" dir="ltr" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0550 12 34 56" />
          </div>
          {av && (
            <div className="sm:col-span-2">
              <ReasonPicker
                lang={lang}
                config={av.reason}
                value={reason}
                onChange={setReason}
                idPrefix="ap-reason"
                full={(day && av.full[day]) || []}
                fullSelectable={av.override}
              />
            </div>
          )}
        </div>
        {!av ? (
          <p className="flex items-center justify-center gap-2 py-6 text-slate-400">
            <Loader2 size={18} className="animate-spin" />
          </p>
        ) : (
          <>
            {(() => {
              // مدّة حجز طويلة (أكثر من أسبوعين): التقويم افتراضياً
              const cal = calendar ?? av.days.length > 14;
              const pick = (d: string) => {
                setDay(d);
                setTime(null);
              };
              return (
                <div className="space-y-2">
                  <div className="flex justify-end">
                    <button type="button" className="btn-ghost btn-sm text-brand-700" onClick={() => toggleCalendar(!cal)} data-testid="desk-days-toggle">
                      {cal ? <GalleryHorizontal size={16} /> : <CalendarDays size={16} />} {t(lang, cal ? "ap_dayStrip" : "ap_calendar")}
                    </button>
                  </div>
                  {cal ? <DayCalendar lang={lang} days={av.days} value={day} onChange={pick} /> : <DayPills lang={lang} days={av.days} value={day} size="sm" onChange={pick} />}
                </div>
              );
            })()}
            {selected ? (
              <div className="max-h-64 overflow-y-auto pe-1">
                <TimeGrid lang={lang} day={selected} value={time} onChange={setTime} perSlot={av.perSlot} />
              </div>
            ) : (
              <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-500">{t(lang, "ap_noTimes")}</p>
            )}
          </>
        )}
        <label className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
          <input
            type="checkbox"
            className="size-5 accent-brand-600"
            checked={printAfter}
            onChange={(e) => {
              setPrintAfter(e.target.checked);
              setAutoPrint("appt", e.target.checked);
            }}
            data-testid="ap-print"
          />
          <Printer size={17} className="shrink-0 text-slate-500" /> {t(lang, "pr_autoAppt")}
        </label>
        {error && (
          <div className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">
            {error}
            {canForce && (
              <button type="button" className="btn-secondary btn-sm mt-2 w-full" disabled={busy} onClick={() => submit(true)} data-testid="ap-force">
                {t(lang, "lm_forceAdd")}
              </button>
            )}
          </div>
        )}
        <button className="btn-primary w-full" disabled={busy || !day || !time} data-testid="ap-desk-submit">
          <CalendarPlus size={18} /> {day && time ? `${t(lang, "ap_confirm")} · ${fmtDay(lang, day, "short")} ${time}` : t(lang, "ap_confirm")}
        </button>
      </form>
    </Dialog>
  );
}
