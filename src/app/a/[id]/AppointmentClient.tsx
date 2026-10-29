"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, CalendarCheck2, CalendarPlus, CalendarX2, CheckCircle2, Clock3, DoorOpen, Download, ImageDown, PartyPopper, Share2, Ticket, XCircle } from "lucide-react";
import ClinicCard from "@/components/ClinicCard";
import Dialog, { ConfirmDialog } from "@/components/Dialog";
import { Chip } from "@/components/ui";
import { daysBetween, fmtDay } from "@/lib/domain/appointments";
import type { Lang } from "@/lib/domain/types";
import { drTitle, errorText, reasonText, t, tn } from "@/lib/i18n";
import { googleCalendarUrl } from "@/lib/ics";
import { api, ApiError, playSound, saveTicket, unlockAudio, usePoll } from "@/lib/client";
import { forgetAppt, saveAppt } from "@/lib/appointments-client";
import { appointmentImage } from "@/lib/appt-image";
import type { AppointmentView } from "@/lib/server/appointments";

function relative(lang: Lang, v: AppointmentView, nowMs: number): string {
  const days = daysBetween(v.today, v.day);
  if (days >= 2) return tn(lang, "ap_inDays", days);
  if (days === 1) return t(lang, "ap_tomorrow");
  if (days < 0) return "";
  const mins = Math.round((Date.parse(v.startsAt) - nowMs) / 60000);
  if (mins <= 0) return t(lang, "ap_isNow");
  const span = mins < 60 ? t(lang, "sp_min", { n: mins }) : t(lang, "sp_hmin", { h: Math.floor(mins / 60), m: String(mins % 60).padStart(2, "0") });
  return `${t(lang, "ap_today")} · ${t(lang, "ap_inTime", { t: span })}`;
}

const yearSuffix = (v: AppointmentView) => (v.day.slice(0, 4) !== v.today.slice(0, 4) ? ` ${v.day.slice(0, 4)}` : "");

/** ملخّص الموعد كاملاً (يصلح للقطة شاشة): الاسم، الهاتف، السبب، التاريخ والساعة، الطبيب والعنوان. */
function AppointmentDetails({ lang, v }: { lang: Lang; v: AppointmentView }) {
  const year = yearSuffix(v);
  const rows: [string, React.ReactNode, string?][] = [
    [t(lang, "ap_dtName"), v.name],
    ...(v.phone ? [[t(lang, "ap_dtPhone"), <span key="p" dir="ltr" className="num">{v.phone}</span>] as [string, React.ReactNode]] : []),
    ...(v.reason ? [[t(lang, "vr_label"), reasonText(lang, v.reason), "appt-reason"] as [string, React.ReactNode, string]] : []),
    [t(lang, "ap_dtDate"), `${fmtDay(lang, v.day)}${year}`],
    [t(lang, "ap_dtTime"), <span key="t" dir="ltr" className="num">{v.time}</span>],
    [t(lang, "ap_dtDoctor"), drTitle(lang, v.shop.kind, v.shop.profile.doctorName) ?? v.shop.name],
    ...(v.shop.profile.address ? [[t(lang, "ap_dtAddress"), v.shop.profile.address] as [string, React.ReactNode]] : []),
  ];
  return (
    <section className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70" data-testid="appt-details">
      <h2 className="mb-2 text-sm font-bold text-slate-700">{t(lang, "ap_details")}</h2>
      <dl className="divide-y divide-slate-200/70 text-sm">
        {rows.map(([k, val, id]) => (
          <div key={k} className="flex items-start justify-between gap-4 py-2">
            <dt className="shrink-0 text-slate-500">{k}</dt>
            <dd className="min-w-0 text-end font-semibold text-ink" data-testid={id}>
              {val}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function AppointmentClient({ lang, initial, door }: { lang: Lang; initial: AppointmentView; door: string | null }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [askCancel, setAskCancel] = useState(false);
  const [just, setJust] = useState<"new" | "existing" | null>(null);
  const [android, setAndroid] = useState(false);
  const [copied, setCopied] = useState(false);
  const [img, setImg] = useState<{ url: string; name: string; file: File; canShare: boolean } | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  // ساعة الخادم (هواتف كثيرة ساعتها خاطئة): الفرق يُحسب بعد التحميل
  const [nowMs, setNowMs] = useState(() => Date.parse(initial.serverTime));
  const [pageUrl, setPageUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    setAndroid(/android/i.test(navigator.userAgent));
    setPageUrl(location.href.split("?")[0]);
    const s = Date.parse(initial.serverTime) - Date.now();
    setNowMs(Date.now() + s);
    const id = setInterval(() => setNowMs(Date.now() + s), 30000);
    try {
      const raw = sessionStorage.getItem("dawri:justBooked");
      const j = raw ? (JSON.parse(raw) as { id: string; existing: boolean }) : null;
      if (j?.id === initial.id) {
        sessionStorage.removeItem("dawri:justBooked");
        setJust(j.existing ? "existing" : "new");
        if (!j.existing) playSound("taken");
      }
    } catch {}
    return () => clearInterval(id);
  }, [initial.id, initial.serverTime]);

  useEffect(() => {
    if (v.status === "booked") saveAppt(v.shop.slug, { id: v.id, day: v.day, time: v.time });
    else if (v.status === "cancelled" || v.status === "no_show") forgetAppt(v.shop.slug, v.id);
  }, [v.status, v.shop.slug, v.id, v.day, v.time]);

  // يوم الموعد: نتابع (زرّ «وصلت» يُفتح وحده، وتسجيل السكرتيرة للوصول يظهر هنا)
  usePoll(async () => {
    if (v.status !== "booked" || v.day !== v.today) return;
    setV(await api<AppointmentView>(`/api/a/${v.id}`));
  }, 30000);

  async function act(action: "checkin" | "cancel") {
    if (action === "checkin") unlockAudio();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ view: AppointmentView; ticketId: string | null }>(`/api/a/${v.id}`, { action, door: action === "checkin" ? (door ?? undefined) : undefined });
      setV(r.view);
      if (r.ticketId) {
        saveTicket(v.shop.slug, r.ticketId);
        try {
          sessionStorage.setItem("dawri:justTook", r.ticketId); // صفحة التذكرة تُصدر نغمة التأكيد
        } catch {}
        router.push(`/t/${r.ticketId}`);
      }
    } catch (e) {
      setError(errorText(lang, (e as ApiError).code));
      api<AppointmentView>(`/api/a/${v.id}`).then(setV).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  /** صورة الموعد للحفظ في معرض الصور (تُرسم على الهاتف) */
  async function saveImage() {
    setImgBusy(true);
    setError("");
    try {
      const blob = await appointmentImage({
        rtl: lang === "ar",
        themeFrom: cardRef.current ?? document.body,
        shop: v.shop.name,
        title: t(lang, "ap_yourAppt"),
        date: `${fmtDay(lang, v.day)}${yearSuffix(v)}`,
        time: v.time,
        rows: [
          [t(lang, "ap_dtName"), v.name],
          ...(v.phone ? [[t(lang, "ap_dtPhone"), v.phone, true] as [string, string, boolean]] : []),
          ...(v.reason ? [[t(lang, "vr_label"), reasonText(lang, v.reason) ?? ""] as [string, string]] : []),
          [t(lang, "ap_dtDoctor"), drTitle(lang, v.shop.kind, v.shop.profile.doctorName) ?? v.shop.name],
          ...(v.shop.profile.address ? [[t(lang, "ap_dtAddress"), v.shop.profile.address] as [string, string]] : []),
          ...(v.shop.profile.phone ? [[t(lang, "ap_dtClinicPhone"), v.shop.profile.phone, true] as [string, string, boolean]] : []),
        ],
        url: `${location.origin}/a/${v.id}`,
        scanText: t(lang, "ap_imgScan"),
        footer: "دوري — Dawri",
      });
      const name = `dawri-${v.day}-${v.time.replace(":", "h")}.png`;
      const file = new File([blob], name, { type: "image/png" });
      if (img) URL.revokeObjectURL(img.url);
      setImg({ url: URL.createObjectURL(blob), name, file, canShare: Boolean(navigator.canShare?.({ files: [file] })) });
    } catch {
      setError(t(lang, "ap_imgFail"));
    } finally {
      setImgBusy(false);
    }
  }

  async function shareImage() {
    if (!img) return;
    try {
      await navigator.share({ files: [img.file], title: `${v.shop.name} — ${fmtDay(lang, v.day)} ${v.time}` });
    } catch {}
  }

  async function share() {
    const url = location.href.split("?")[0];
    try {
      if (navigator.share) await navigator.share({ title: `${v.shop.name} — ${fmtDay(lang, v.day)} ${v.time}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {}
  }

  const booked = v.status === "booked";
  const today = v.day === v.today;
  const band =
    v.status === "arrived"
      ? "from-brand-500 to-brand-700"
      : v.status === "no_show"
        ? "from-amber-400 to-amber-600"
        : v.status === "cancelled"
          ? "from-slate-400 to-slate-500"
          : "from-brand-600 to-brand-800";
  const statusLabel = t(lang, `ap_st_${v.status}`);
  const rel = booked ? relative(lang, v, nowMs) : "";
  const gcal = googleCalendarUrl({
    start: new Date(v.startsAt),
    end: new Date(v.endsAt),
    title: t(lang, "ap_icsSummary", { shop: v.shop.name }),
    details: pageUrl,
    location: v.shop.profile.address,
  });
  const ics = `/api/a/${v.id}/ics`;

  return (
    <>
      {just && (
        <div className="flex animate-pop items-center gap-3 rounded-3xl bg-brand-600 p-4 text-white shadow-(--shadow-brand)" role="status" data-testid="booked-banner">
          <PartyPopper size={26} className="shrink-0" />
          <div>
            <div className="text-lg font-bold">{just === "new" ? t(lang, "ap_bookedOk") : t(lang, "ap_existing")}</div>
            <div className="text-sm text-brand-50">{t(lang, "ap_reminderHint")}</div>
          </div>
        </div>
      )}

      {/* ——— بطاقة الموعد ——— */}
      <section ref={cardRef} className="overflow-hidden rounded-[1.75rem] bg-white shadow-(--shadow-lift) ring-1 ring-slate-200/70" aria-live="polite" data-testid="appointment">
        <div className={`relative bg-gradient-to-br ${band} px-6 pt-5 pb-7 text-white`}>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-1.5 font-semibold opacity-90">
              <CalendarCheck2 size={16} className="shrink-0" /> <span className="truncate">{v.shop.name}</span>
            </span>
            <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold" data-testid="appt-status">
              {statusLabel}
            </span>
          </div>
          <div className="mt-4 text-center">
            <div className="text-sm font-medium opacity-85">{t(lang, "ap_yourAppt")}</div>
            <div className={`mt-1 text-xl font-bold ${v.status === "cancelled" ? "line-through opacity-80" : ""}`}>{fmtDay(lang, v.day)}</div>
            <div className={`num mt-1 text-7xl leading-none font-bold ${v.status === "cancelled" ? "line-through opacity-80" : ""}`} dir="ltr" data-testid="appt-time">
              {v.time}
            </div>
            {rel && <div className="mt-3 inline-flex rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">{rel}</div>}
            <div className="mt-2 text-lg font-semibold opacity-95">{v.name}</div>
          </div>
        </div>
        <div className="relative h-0">
          <span className="absolute -top-3 size-6 rounded-full bg-[#f5f7fa] ltr:-left-3 rtl:-right-3" />
          <span className="absolute -top-3 size-6 rounded-full bg-[#f5f7fa] ltr:-right-3 rtl:-left-3" />
          <span className="absolute inset-x-5 -top-px border-t-2 border-dashed border-white/60" />
        </div>

        <div className="space-y-4 p-6">
          <AppointmentDetails lang={lang} v={v} />
          {booked && v.canCheckin && (
            <div className="space-y-3 text-center">
              <p className="text-xl font-bold text-ink">{t(lang, "ap_checkinTitle")}</p>
              <p className="text-sm leading-relaxed text-slate-600">{t(lang, "ap_checkinHint")}</p>
              <button className="btn-primary w-full py-5 text-xl" onClick={() => act("checkin")} disabled={busy} data-testid="appt-checkin">
                <DoorOpen size={24} /> {busy ? "…" : t(lang, "ap_iArrived")}
              </button>
            </div>
          )}
          {booked && today && v.window === "early" && (
            <p className="flex items-start gap-2.5 rounded-2xl bg-slate-50 p-3.5 text-sm text-slate-700 ring-1 ring-slate-200/70">
              <Clock3 size={18} className="mt-0.5 shrink-0 text-brand-600" />
              <span>{t(lang, "ap_checkinOpens", { time: v.opensAt })}</span>
            </p>
          )}
          {booked && v.window === "late" && (
            <p className="rounded-2xl bg-amber-50 p-3.5 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">{t(lang, "ap_checkinMissed")}</p>
          )}

          {v.status === "arrived" && (
            <div className="space-y-3 text-center">
              <CheckCircle2 size={48} className="mx-auto text-brand-600" />
              <p className="text-xl font-bold">{v.ticket ? t(lang, "ap_arrivedMsg", { n: v.ticket.number }) : t(lang, "ap_st_arrived")}</p>
              {v.ticket && (
                <Link href={`/t/${v.ticket.id}`} className="btn-primary w-full">
                  <Ticket size={18} /> {t(lang, "openMyTicket")}
                </Link>
              )}
            </div>
          )}
          {(v.status === "cancelled" || v.status === "no_show") && (
            <div className="space-y-3 text-center">
              {v.status === "cancelled" ? <XCircle size={44} className="mx-auto text-slate-400" /> : <CalendarX2 size={44} className="mx-auto text-amber-500" />}
              <p className="text-lg font-bold">{t(lang, v.status === "cancelled" ? "ap_cancelledMsg" : "ap_noShowMsg")}</p>
              <Link href={`/s/${v.shop.slug}/book`} className="btn-primary w-full">
                <CalendarPlus size={18} /> {t(lang, "ap_bookAgain")}
              </Link>
            </div>
          )}

          {error && (
            <p className="rounded-xl bg-rose-50 p-3 text-center text-sm font-semibold text-rose-700" role="alert">
              {error}
            </p>
          )}

          {booked && (
            <div className="space-y-2" data-testid="save-appt">
              <div className="pt-1 text-center text-sm font-bold text-slate-700">{t(lang, "ap_saveTitle")}</div>
              <button
                type="button"
                className={`${v.canCheckin ? "btn-secondary" : "btn-primary"} w-full`}
                onClick={saveImage}
                disabled={imgBusy}
                data-testid="save-image"
              >
                <ImageDown size={18} /> {imgBusy ? "…" : t(lang, "ap_saveImage")}
              </button>
              <a
                href={android ? gcal : ics}
                target={android ? "_blank" : undefined}
                rel={android ? "noopener noreferrer" : undefined}
                download={android ? undefined : true}
                className="btn-secondary w-full"
                data-testid="add-calendar"
              >
                <CalendarPlus size={18} /> {t(lang, "ap_addCal")}
              </a>
              <p className="text-center text-xs text-slate-500">
                <a href={android ? ics : gcal} target={android ? undefined : "_blank"} rel="noopener noreferrer" download={android ? true : undefined} className="underline-offset-2 hover:text-brand-700 hover:underline">
                  {android ? t(lang, "ap_addCalIcs") : t(lang, "ap_addCalGoogle")}
                </a>
              </p>
            </div>
          )}
        </div>
      </section>

      <ClinicCard lang={lang} name={v.shop.name} kind={v.shop.kind} profile={v.shop.profile} compact={!v.shop.profile.address && !v.shop.profile.phone} />

      <div className="grid grid-cols-2 gap-2">
        <button className="btn-secondary" onClick={share}>
          <Share2 size={18} /> {copied ? t(lang, "tk_copied") : t(lang, "ap_share")}
        </button>
        {v.canCancel ? (
          <button className="btn-danger" onClick={() => setAskCancel(true)} disabled={busy} data-testid="appt-cancel">
            <XCircle size={18} /> {t(lang, "ap_cancel")}
          </button>
        ) : (
          <a className="btn-secondary" href={`/s/${v.shop.slug}?from=ticket`}>
            {t(lang, "ap_backClinic")}
          </a>
        )}
      </div>

      {v.canCancel && (
        <a href={`/s/${v.shop.slug}?from=ticket`} className="block text-center text-sm font-semibold text-brand-700 hover:underline">
          {t(lang, "ap_backClinic")}
        </a>
      )}

      {booked && (
        <p className="flex items-start justify-center gap-2 text-center text-xs leading-relaxed text-slate-500">
          <Bookmark size={14} className="mt-0.5 shrink-0" /> {t(lang, "ap_screenshot")}
        </p>
      )}

      <Dialog
        open={img !== null}
        onClose={() => {
          if (img) URL.revokeObjectURL(img.url);
          setImg(null);
        }}
        title={t(lang, "ap_saveTitle")}
        closeLabel={t(lang, "a11y_close")}
      >
        {img && (
          <div className="space-y-3" data-testid="appt-image">
            {/* eslint-disable-next-line @next/next/no-img-element -- صورة محلّية (blob) */}
            <img src={img.url} alt={`${fmtDay(lang, v.day)} ${v.time}`} className="mx-auto max-h-[55vh] w-auto rounded-2xl ring-1 ring-slate-200" />
            <p className="text-center text-xs leading-relaxed text-slate-500">{t(lang, "ap_saveImageHint")}</p>
            <a href={img.url} download={img.name} className="btn-primary w-full" data-testid="download-image">
              <Download size={18} /> {t(lang, "ap_download")}
            </a>
            {img.canShare && (
              <button type="button" className="btn-secondary w-full" onClick={shareImage}>
                <Share2 size={18} /> {t(lang, "ap_shareImage")}
              </button>
            )}
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={askCancel}
        title={t(lang, "ap_cancelSure")}
        body={
          <span>
            {t(lang, "ap_cancelBody")}{" "}
            <Chip className="mt-2">
              {fmtDay(lang, v.day)} · <span dir="ltr" className="num">{v.time}</span>
            </Chip>
          </span>
        }
        confirmLabel={t(lang, "ap_cancel")}
        cancelLabel={t(lang, "ap_keep")}
        danger
        onConfirm={() => act("cancel")}
        onClose={() => setAskCancel(false)}
        closeLabel={t(lang, "a11y_close")}
      />
    </>
  );
}
