"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarCheck2, CalendarDays, CalendarX2, Clock3, KeyRound, Phone, ShieldCheck, User } from "lucide-react";
import ClinicCard from "@/components/ClinicCard";
import { DayPills, TimeGrid } from "@/components/SlotPicker";
import { fmtDay } from "@/lib/domain/appointments";
import type { Lang, ShopKind, ShopProfile } from "@/lib/domain/types";
import { errorText, t } from "@/lib/i18n";
import { api, ApiError, unlockAudio, usePoll } from "@/lib/client";
import { loadProfile, saveAppt, saveProfile } from "@/lib/appointments-client";
import type { PublicAvailability } from "@/lib/server/appointments";

const RETRY_SLOT = ["ap_slot_unavailable", "ap_day_full", "ap_invalid_slot"];

export default function BookClient({
  lang,
  slug,
  shop,
  initial,
  error: initialError,
}: {
  lang: Lang;
  slug: string;
  shop: { name: string; kind: ShopKind; profile: ShopProfile };
  initial: PublicAvailability | null;
  error: string | null;
}) {
  const router = useRouter();
  const [av, setAv] = useState(initial);
  const [day, setDay] = useState<string | null>(initial?.days.find((d) => d.state === "open")?.day ?? null);
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const detailsRef = useRef<HTMLElement>(null);
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;

  useEffect(() => {
    const p = loadProfile();
    if (p.name) setName(p.name);
    if (p.phone) setPhone(p.phone);
  }, []);

  // الأوقات تتغيّر بحجوزات الآخرين: تحديث كلّ دقيقة (رخيص ومخزَّن في الـCDN)
  usePoll(async () => {
    if (av) setAv(await api<PublicAvailability>(`/api/s/${slug}/booking`));
  }, 60000);

  // اليوم أو الوقت المختار لم يعد متاحاً بعد التحديث؟
  useEffect(() => {
    if (!av) return;
    const d = av.days.find((x) => x.day === day);
    if (!d || d.state !== "open") {
      const first = av.days.find((x) => x.state === "open")?.day ?? null;
      if (first !== day) {
        setDay(first);
        setTime(null);
      }
      return;
    }
    if (time && !d.slots.some((s) => s.time === time && s.left > 0)) {
      setTime(null);
      setError(errorText(lang, "ap_slot_unavailable"));
    }
  }, [av, day, time, lang]);

  const pickTime = (v: string) => {
    setTime(v);
    setError("");
    // نموذج الاسم والهاتف يظهر تحت الشبكة: ننزل إليه بلطف
    requestAnimationFrame(() => detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  async function run(fn: () => Promise<void>) {
    unlockAudio();
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      const code = (e as ApiError).code;
      if (RETRY_SLOT.includes(code)) {
        // سُبق إلى الوقت: نعيد التحميل (بلا ذاكرة الـCDN) ونطلب وقتاً آخر — الرمز ما زال صالحاً
        try {
          setAv(await api<PublicAvailability>(`/api/s/${slug}/booking?fresh=${Date.now()}`));
        } catch {}
        setTime(null);
        setError(codeSent ? t(lang, "ap_slotTaken") : errorText(lang, code));
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (code === "code_expired") {
        setCodeSent(false);
        setCode("");
      }
      setError(errorText(lang, code));
    } finally {
      setBusy(false);
    }
  }

  const doBook = async () => {
    const r = await api<{ appointmentId: string; existing: boolean }>(`/api/s/${slug}/booking`, { name, phone, code, day, time, lang });
    saveAppt(slug, { id: r.appointmentId, day: day!, time: time! });
    saveProfile(name, phone);
    try {
      sessionStorage.setItem("dawri:justBooked", JSON.stringify({ id: r.appointmentId, existing: r.existing }));
    } catch {}
    router.push(`/a/${r.appointmentId}`);
  };

  const submit = () =>
    run(async () => {
      if (av?.verify === "sms" && !codeSent) {
        const r = await api<{ verify: boolean; devCode?: string }>(`/api/s/${slug}/booking/code`, { name, phone, day, time, lang });
        if (r.verify) {
          setDevCode(r.devCode ?? null);
          setCodeSent(true);
          return;
        }
      }
      await doBook();
    });

  const header = (
    <>
      <Link href={`/s/${slug}?from=ticket`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-brand-700">
        <Back size={16} /> {t(lang, "ap_backClinic")}
      </Link>
      <ClinicCard lang={lang} name={shop.name} kind={shop.kind} profile={shop.profile} compact={!shop.profile.address && !shop.profile.phone} />
    </>
  );

  const callClinic = shop.profile.phone ? (
    <a href={`tel:${shop.profile.phone.replace(/\s/g, "")}`} className="btn-secondary mt-4 w-full">
      <Phone size={18} /> <span dir="ltr">{shop.profile.phone}</span>
    </a>
  ) : null;

  if (!av || av.verify === "unavailable") {
    return (
      <>
        {header}
        <section className="card text-center" data-testid="booking-unavailable">
          <CalendarX2 size={40} className="mx-auto text-slate-300" />
          <p className="mt-2 text-lg font-bold">{!av && initialError ? errorText(lang, initialError) : t(lang, "ap_unavailableTitle")}</p>
          <p className="mt-1 text-sm text-slate-600">{t(lang, "ap_callClinic")}</p>
          {callClinic}
        </section>
      </>
    );
  }

  const selected = av.days.find((d) => d.day === day) ?? null;
  const anyOpen = av.days.some((d) => d.state === "open");

  return (
    <>
      {header}

      <section className="card p-5">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <CalendarDays size={22} className="text-brand-600" /> {t(lang, "ap_bookTitle")}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">{t(lang, "ap_bookSub")}</p>

        {error && !time && (
          <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">
            {error}
          </p>
        )}

        {!anyOpen ? (
          <div className="mt-5 rounded-2xl bg-slate-50 p-5 text-center">
            <p className="text-slate-600">{t(lang, "ap_noDays")}</p>
            {callClinic}
          </div>
        ) : (
          <>
            <div className="label mt-5">{t(lang, "ap_pickDay")}</div>
            <DayPills
              lang={lang}
              days={av.days}
              value={day}
              onChange={(d) => {
                setDay(d);
                setTime(null);
              }}
            />
            {selected && (
              <>
                <div className="mt-3 mb-2 flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-600">{t(lang, "ap_pickTime")}</span>
                  <span className="truncate text-xs text-slate-500">{fmtDay(lang, selected.day)}</span>
                </div>
                <TimeGrid lang={lang} day={selected} value={time} onChange={pickTime} perSlot={av.perSlot} />
              </>
            )}
            {av.minLeadMin > 0 && (
              <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
                <Clock3 size={13} /> {t(lang, "ap_leadHint", { n: av.minLeadMin })}
              </p>
            )}
          </>
        )}
      </section>

      {time && day && (
        <section ref={detailsRef} className="card animate-fade-up scroll-mt-4 p-5" data-testid="book-details">
          <div className="flex items-center gap-3 rounded-2xl bg-brand-50 p-3.5 ring-1 ring-brand-200/70">
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
              <CalendarCheck2 size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-brand-900">{fmtDay(lang, day)}</div>
              <div className="num text-2xl leading-tight font-bold text-brand-800">
                <span dir="ltr">{time}</span>
              </div>
            </div>
            <button type="button" className="btn-ghost btn-sm shrink-0 text-brand-800" onClick={() => setTime(null)}>
              {t(lang, "ap_change")}
            </button>
          </div>

          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {!codeSent ? (
              <>
                <div className="text-sm font-bold text-slate-700">{t(lang, "ap_yourDetails")}</div>
                <div>
                  <label className="label" htmlFor="bk-name">{t(lang, "yourName")}</label>
                  <div className="relative">
                    <User size={18} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 ltr:left-4 rtl:right-4" />
                    <input id="bk-name" className="input ps-11" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={60} />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="bk-phone">{t(lang, "yourPhone")}</label>
                  <div className="relative">
                    <Phone size={18} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 ltr:left-4 rtl:right-4" />
                    <input
                      id="bk-phone"
                      className="input num ps-11 text-start"
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
              </>
            ) : (
              <>
                <p className="flex items-center gap-2 text-slate-700">
                  <KeyRound size={18} className="text-brand-600" /> {t(lang, "codeSent")}
                </p>
                {devCode && (
                  <p className="rounded-xl bg-amber-50 p-2.5 text-center text-sm text-amber-800 ring-1 ring-amber-200">
                    {t(lang, "demoCode")} <b className="num text-base" dir="ltr">{devCode}</b>
                  </p>
                )}
                <div>
                  <label className="label" htmlFor="bk-code">{t(lang, "codeLabel")}</label>
                  <input
                    id="bk-code"
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
              </>
            )}
            {error && (
              <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">
                {error}
              </p>
            )}
            <button className="btn-primary w-full text-lg" disabled={busy || (codeSent && code.length !== 6)} data-testid="book-submit">
              {busy ? "…" : codeSent ? t(lang, "ap_confirmCode") : av.verify === "sms" ? t(lang, "sendCode") : t(lang, "ap_confirm")}
            </button>
            {codeSent && (
              <button
                type="button"
                className="w-full text-center text-sm text-slate-500 hover:text-ink"
                onClick={() => {
                  setCodeSent(false);
                  setCode("");
                }}
              >
                {t(lang, "changePhone")}
              </button>
            )}
          </form>
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
    </>
  );
}
