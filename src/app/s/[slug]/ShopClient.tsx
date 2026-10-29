"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, CheckCircle2, Hourglass, KeyRound, Loader2, MessageCircle, Phone, QrCode, ShieldCheck, Ticket, User, Users } from "lucide-react";
import ClinicCard from "@/components/ClinicCard";
import ReasonPicker from "@/components/ReasonPicker";
import { reasonsFor } from "@/lib/domain/reasons";
import { Stat } from "@/components/ui";
import type { Lang } from "@/lib/domain/types";
import { errorText, t } from "@/lib/i18n";
import { api, ApiError, saveTicket, savedTicket, unlockAudio, usePoll } from "@/lib/client";
import type { PublicShopView } from "@/lib/server/service";
import type { BookingTeaser } from "@/lib/server/appointments";
import ShopBooking from "./ShopBooking";

const PROFILE = "dawri:profile";

function fmtWait(lang: Lang, min: number) {
  if (min <= 0) return t(lang, "sp_noWait");
  if (min < 60) return t(lang, "sp_min", { n: min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  return t(lang, "sp_hmin", { h, m: String(m).padStart(2, "0") });
}

export default function ShopClient({ lang, initial, door, booking = null }: { lang: Lang; initial: PublicShopView; door: string | null; booking?: BookingTeaser | null }) {
  const router = useRouter();
  const [apptAtDoor, setApptAtDoor] = useState(false); // له موعد اليوم ومسح رمز الباب: بطاقة الوصول بدل النموذج
  const [view, setView] = useState(initial);
  const [mine, setMine] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"form" | "code" | "wa">("form");
  const [wa, setWa] = useState<{ id: string; link: string; code: string; expired?: boolean } | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [arrivedMsg, setArrivedMsg] = useState(false);
  const [recover, setRecover] = useState(false);

  useEffect(() => {
    const id = savedTicket(view.slug);
    setMine(id);
    // تذكرة اليوم موجودة ولم يأتِ من رمز الباب ← نفتحها مباشرة
    const fromTicket = new URLSearchParams(location.search).get("from") === "ticket";
    if (id && !door && !fromTicket) router.replace(`/t/${id}`);
    try {
      const p = JSON.parse(localStorage.getItem(PROFILE) ?? "{}");
      if (p.name) setName(p.name);
      if (p.phone) setPhone(p.phone);
    } catch {}
  }, [view.slug, door, router]);

  usePoll(async () => setView(await api<PublicShopView>(`/api/s/${view.slug}`)), 20000);

  // ننتظر رسالة واتساب: تتحقّق الصفحة كلّ ثانيتين ونصف (وفوراً عند الرجوع من واتساب)
  usePoll(async () => {
    if (step !== "wa" || !wa || wa.expired) return;
    const r = await api<{ status: "pending" | "done" | "expired" | "failed"; ticketId: string | null; reason: string | null }>(`/api/s/${view.slug}/wa-verify/${wa.id}`);
    if (r.status === "done" && r.ticketId) finish(r.ticketId);
    else if (r.status === "expired") setWa({ ...wa, expired: true });
    else if (r.status === "failed") {
      setWa({ ...wa, expired: true });
      setError(errorText(lang, r.reason ?? undefined));
    }
  }, 2500);

  async function run(fn: () => Promise<void>) {
    unlockAudio(); // نحن داخل نقرة الزبون: نفتح الصوت لبقيّة الزيارة
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(lang, (e as ApiError).code));
    } finally {
      setBusy(false);
    }
  }

  const finish = (ticketId: string) => {
    saveTicket(view.slug, ticketId);
    try {
      sessionStorage.setItem("dawri:justTook", ticketId); // صفحة التذكرة تُصدر نغمة التأكيد
      localStorage.setItem(PROFILE, JSON.stringify({ name, phone }));
    } catch {}
    router.push(`/t/${ticketId}`);
  };

  // زرّ «عبر الرسالة» خارج إرسال النموذج: لا يمرّ بتحقّق المتصفّح
  const missingReason = () => {
    if (!reasonsFor(view.kind).length || reason) return false;
    setError(errorText(lang, "invalid_reason"));
    return true;
  };

  const sendCode = () =>
    !missingReason() &&
    run(async () => {
      const r = await api<{ verify: boolean; devCode?: string }>(`/api/s/${view.slug}/code`, { name, phone, lang });
      if (!r.verify) {
        const tk = await api<{ ticketId: string }>(`/api/s/${view.slug}/tickets`, { name, phone, reason, door, lang });
        return finish(tk.ticketId);
      }
      setDevCode(r.devCode ?? null);
      setStep("code");
    });

  const startWa = () =>
    run(async () => {
      const r = await api<{ id: string; link: string; code: string }>(`/api/s/${view.slug}/wa-verify`, { name, phone, reason, lang, door });
      setWa(r);
      setStep("wa");
    });

  const confirm = () =>
    run(async () => {
      const tk = await api<{ ticketId: string }>(`/api/s/${view.slug}/tickets`, { name, phone, reason, code, door, lang });
      finish(tk.ticketId);
    });

  const checkIn = () =>
    run(async () => {
      await api(`/api/t/${mine}`, { action: "checkin", door });
      setArrivedMsg(true);
      setTimeout(() => router.push(`/t/${mine}`), 900);
    });

  return (
    <>
      <ClinicCard
        lang={lang}
        name={view.name}
        kind={view.kind}
        profile={view.profile}
        blocker={view.blocker}
        hoursToday={view.hoursToday}
        rating={view.rating}
      />

      <ShopBooking lang={lang} slug={view.slug} door={door} teaser={booking} blocker={view.blocker} onHideForm={setApptAtDoor} />

      <section className="grid grid-cols-3 gap-2.5" aria-live="polite">
        <Stat icon={<Ticket size={13} />} label={t(lang, "nowServing")} value={view.currentNumber ?? <span className="text-slate-400">· · ·</span>} />
        <Stat icon={<Users size={13} />} label={t(lang, "waitingCount")} value={view.waiting} />
        <Stat icon={<Hourglass size={13} />} label={t(lang, "sp_wait")} value={<span className="text-lg">{fmtWait(lang, view.waitNewMin)}</span>} />
      </section>

      {apptAtDoor ? null : mine && door ? (
        <section className="card space-y-4 text-center">
          {arrivedMsg ? (
            <div className="animate-pop py-4">
              <CheckCircle2 size={56} className="mx-auto text-brand-600" />
              <p className="mt-2 text-xl font-bold text-brand-800">{t(lang, "arrivedOk")}</p>
            </div>
          ) : (
            <>
              <QrCode size={40} className="mx-auto text-brand-600" />
              <p className="text-lg font-bold">{t(lang, "yourTicketToday")}</p>
              <p className="text-slate-600">{t(lang, "sp_arrivedQ")}</p>
              <button className="btn-primary w-full py-5 text-2xl" onClick={checkIn} disabled={busy}>
                {t(lang, "iArrived")}
              </button>
            </>
          )}
          <a className="block font-semibold text-brand-700 hover:underline" href={`/t/${mine}`}>
            {t(lang, "openMyTicket")}
          </a>
          {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">{error}</p>}
        </section>
      ) : view.blocker && !recover ? (
        <section className="card text-center">
          <Hourglass size={36} className="mx-auto text-amber-500" />
          <p className="mt-2 text-lg font-bold">{errorText(lang, view.blocker)}</p>
          {(view.blocker === "on_break" || view.blocker === "not_open_yet") && view.resumesAt ? (
            <p className="mx-auto mt-3 inline-flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-2.5 font-semibold text-amber-900 ring-1 ring-amber-200" data-testid="resumes-at">
              {t(lang, "sp_resumesAt")}
              <b className="num text-xl" dir="ltr">{view.resumesAt}</b>
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-600">{t(lang, view.blocker === "queue_closed" ? "sp_closedHint" : view.blocker === "day_off" ? "sp_dayOffHint" : "sp_comeBack")}</p>
          )}
          {/* من أخذ رقماً اليوم ثمّ أُغلق الطابور يستطيع استرجاع تذكرته */}
          <button type="button" className="mt-3 text-sm font-semibold text-brand-700 hover:underline" onClick={() => setRecover(true)}>
            {t(lang, "sp_haveTicket")}
          </button>
        </section>
      ) : (
        <section className="card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">{t(lang, "takeNumber")}</h2>
            {view.verifyPhone && (
              <ol className="flex items-center gap-1.5 text-xs font-semibold text-slate-400" aria-label="steps">
                {[1, 2].map((n) => {
                  const on = (step === "form" ? 1 : 2) >= n;
                  return (
                    <li key={n} className={`inline-flex size-6 items-center justify-center rounded-full ${on ? "bg-brand-600 text-white" : "bg-slate-100"}`}>
                      {n}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {step === "form" ? (
            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (view.waVerify && view.verifyPhone) startWa();
                else sendCode();
              }}
            >
              <div>
                <label className="label" htmlFor="name">{t(lang, "yourName")}</label>
                <div className="relative">
                  <User size={18} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 ltr:left-4 rtl:right-4" />
                  <input id="name" className="input ps-11" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={60} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="phone">{t(lang, "yourPhone")}</label>
                <div className="relative">
                  <Phone size={18} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 ltr:left-4 rtl:right-4" />
                  <input
                    id="phone"
                    className="input num pl-11 text-left rtl:pr-11 rtl:pl-4 rtl:text-right"
                    dir="ltr"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder={t(lang, "phonePlaceholder")}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>
              </div>
              <ReasonPicker lang={lang} kind={view.kind} value={reason} onChange={setReason} required />
              {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">{error}</p>}
              {view.waVerify && view.verifyPhone ? (
                <>
                  <button className="btn w-full bg-[#128C7E] text-lg text-white shadow-sm hover:bg-[#0e6f64] focus-visible:ring-green-200" disabled={busy}>
                    <MessageCircle size={20} /> {busy ? "…" : t(lang, "sp_viaWa")}
                  </button>
                  <p className="text-center text-xs text-slate-500">{t(lang, "sp_viaWaHint")}</p>
                  {view.smsVerify && (
                    <button type="button" className="w-full text-center text-sm font-semibold text-slate-500 hover:text-ink" onClick={sendCode} disabled={busy}>
                      {t(lang, "sp_viaSms")}
                    </button>
                  )}
                </>
              ) : (
                <button className="btn-primary w-full text-lg" disabled={busy}>
                  {busy ? "…" : view.verifyPhone ? t(lang, "sendCode") : t(lang, "takeNumber")}
                </button>
              )}
            </form>
          ) : step === "wa" && wa ? (
            <div className="mt-5 space-y-4 text-center">
              <p className="font-semibold text-slate-700">{t(lang, "sp_waStep")}</p>
              {wa.expired ? (
                <>
                  <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error || t(lang, "sp_waExpired")}</p>
                  <button type="button" className="btn-secondary w-full" onClick={() => setStep("form")}>
                    {t(lang, "changePhone")}
                  </button>
                </>
              ) : (
                <>
                  <a
                    href={wa.link}
                    className="btn w-full bg-[#128C7E] py-4 text-lg text-white shadow-sm hover:bg-[#0e6f64]"
                    data-testid="wa-open"
                  >
                    <MessageCircle size={22} /> {t(lang, "sp_waOpen")}
                  </a>
                  <p className="num text-sm text-slate-500" dir="ltr">{wa.code}</p>
                  <p className="flex items-center justify-center gap-2 text-sm text-slate-600">
                    <Loader2 size={16} className="animate-spin" /> {t(lang, "sp_waWaiting")}
                  </p>
                  <p className="text-xs leading-relaxed text-slate-400">{t(lang, "sp_waConsent")}</p>
                  <button type="button" className="w-full text-center text-sm text-slate-500 hover:text-ink" onClick={() => setStep("form")}>
                    {t(lang, "changePhone")}
                  </button>
                </>
              )}
            </div>
          ) : (
            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                confirm();
              }}
            >
              <p className="flex items-center gap-2 text-slate-700">
                <KeyRound size={18} className="text-brand-600" /> {t(lang, "codeSent")}
              </p>
              {devCode && (
                <p className="rounded-xl bg-amber-50 p-2.5 text-center text-sm text-amber-800 ring-1 ring-amber-200">
                  {t(lang, "demoCode")} <b className="num text-base" dir="ltr">{devCode}</b>
                </p>
              )}
              <div>
                <label className="label" htmlFor="code">{t(lang, "codeLabel")}</label>
                <input
                  id="code"
                  className="input num text-center text-3xl font-bold tracking-[0.5em]"
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  required
                  autoFocus
                />
              </div>
              {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">{error}</p>}
              <button className="btn-primary w-full text-lg" disabled={busy || code.length !== 6}>
                {busy ? "…" : t(lang, "confirmTicket")}
              </button>
              <button type="button" className="w-full text-center text-sm text-slate-500 hover:text-ink" onClick={() => setStep("form")}>
                {t(lang, "changePhone")}
              </button>
            </form>
          )}
          <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
            <ShieldCheck size={16} className="mt-px shrink-0 text-brand-600" />
            <span>
              {t(lang, "privacy")}{" "}
              <a href="/privacy" target="_blank" className="font-semibold text-brand-700 underline-offset-2 hover:underline">
                {t(lang, "lg_privacy")}
              </a>
            </span>
          </p>
        </section>
      )}

      <section className="grid grid-cols-3 gap-2 text-center text-xs text-slate-600">
        {[
          [<Ticket key="1" size={20} />, t(lang, "sp_how1")],
          [<Hourglass key="2" size={20} />, t(lang, "sp_how2")],
          [<BellRing key="3" size={20} />, t(lang, "sp_how3")],
        ].map(([icon, label], i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/70 p-3 ring-1 ring-slate-200/70">
            <span className="text-brand-600">{icon}</span>
            {label}
          </div>
        ))}
      </section>
      <p className="text-center text-sm text-slate-500">{t(lang, "noSmartphone")}</p>
    </>
  );
}
