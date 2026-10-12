"use client";
import { useEffect, useRef, useState } from "react";
import { Clock3, Maximize2, Stethoscope, Users, Volume2, VolumeX } from "lucide-react";
import SoundGate from "@/components/SoundGate";
import { LogoMark } from "@/components/ui";
import type { Lang } from "@/lib/domain/types";
import { dirOf, drTitle, t } from "@/lib/i18n";
import { api, playSound, unlockAudio, usePoll } from "@/lib/client";
import type { PublicShopView } from "@/lib/server/service";

const VOICE_KEY = "dawri:voice";

/** نداء صوتي بالمتصفّح (إن توفّر صوت للغة على الجهاز). */
function announce(lang: Lang, n: number) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(t(lang, "dp_say", { n }));
    u.lang = lang === "ar" ? "ar-SA" : "fr-FR";
    const v = synth.getVoices().find((x) => x.lang.toLowerCase().startsWith(lang));
    if (v) u.voice = v;
    u.rate = 0.9;
    synth.cancel();
    setTimeout(() => synth.speak(u), 1200); // بعد «دينغ-دونغ»
  } catch {}
}

export default function DisplayClient({ lang, initial, qr }: { lang: Lang; initial: PublicShopView; qr: string }) {
  const [v, setV] = useState(initial);
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");
  const [voice, setVoice] = useState(false);
  // نداء ملء الشاشة لبضع ثوانٍ عند تغيّر الرقم
  const [callout, setCallout] = useState<number | null>(null);
  const last = useRef(initial.currentNumber);

  usePoll(async () => setV(await api<PublicShopView>(`/api/s/${v.slug}`)), 4000);

  useEffect(() => {
    try {
      setVoice(localStorage.getItem(VOICE_KEY) === "1");
    } catch {}
    const tz = "Africa/Algiers";
    const fmt = new Intl.DateTimeFormat("fr-DZ", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz });
    const fmtDate = new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ" : "fr-DZ", { weekday: "long", day: "numeric", month: "long", timeZone: tz });
    const tick = () => {
      const d = new Date();
      setTime(fmt.format(d));
      setDate(fmtDate.format(d));
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, [lang]);

  useEffect(() => {
    if (v.currentNumber !== last.current && v.currentNumber !== null) {
      playSound("next");
      if (voice) announce(lang, v.currentNumber);
      setCallout(v.currentNumber);
      const id = setTimeout(() => setCallout(null), 6000);
      last.current = v.currentNumber;
      return () => clearTimeout(id);
    }
    last.current = v.currentNumber;
  }, [v.currentNumber, voice, lang]);

  const doctor = drTitle(lang, v.kind, v.profile.doctorName);
  const [first, ...rest] = v.nextNumbers;

  return (
    <main
      dir={dirOf(lang)}
      lang={lang}
      className="relative flex min-h-dvh flex-col overflow-hidden bg-[#061420] text-white"
    >
      {/* خلفية: توهّج أخضر هادئ + شبكة خفيفة */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_35rem_at_15%_-10%,rgb(16_185_129/0.28),transparent_60%),radial-gradient(50rem_30rem_at_100%_110%,rgb(14_165_233/0.18),transparent_60%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:56px_56px]" />

      {/* ——— الشريط العلوي ——— */}
      <header className="relative flex items-center justify-between gap-4 border-b border-white/10 px-6 py-4 sm:px-10">
        <div className="flex min-w-0 items-center gap-4">
          <LogoMark size={52} />
          <div className="min-w-0">
            <h1 className="truncate pb-0.5 text-2xl leading-normal font-bold sm:text-3xl">{v.name}</h1>
            {v.profile.specialty && <p className="truncate text-lg text-brand-200">{v.profile.specialty}</p>}
          </div>
        </div>
        <div className="shrink-0 text-end">
          <div className="num text-4xl leading-none font-bold tracking-tight sm:text-5xl" dir="ltr">{time}</div>
          <div className="mt-1 text-sm text-slate-400 sm:text-base">{date}</div>
        </div>
      </header>

      <div className="relative mx-auto w-full max-w-md px-6 pt-3">
        <SoundGate lang={lang} tone="dark" />
      </div>

      {/* ——— المحتوى ——— */}
      <div className="relative grid flex-1 gap-6 px-6 py-6 sm:px-10 lg:grid-cols-[1.55fr_1fr] lg:items-stretch">
        {/* الرقم الحالي */}
        <section className="flex flex-col overflow-hidden rounded-[2.5rem] bg-white/[0.06] ring-1 ring-white/10">
          {doctor && (
            <div className="flex items-center gap-4 border-b border-white/10 bg-gradient-to-l from-brand-500/20 to-transparent px-7 py-5 rtl:bg-gradient-to-r">
              <span className="inline-flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 shadow-[0_10px_30px_-8px_rgb(16_185_129/0.7)]">
                <Stethoscope size={32} />
              </span>
              <div className="min-w-0">
                <div className="text-base font-semibold text-brand-200">{t(lang, "dp_doctor")}</div>
                <div className="truncate pb-1 text-[clamp(1.8rem,3.6vw,3.4rem)] leading-[1.45] font-bold">{doctor}</div>
              </div>
            </div>
          )}
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-8 text-center">
            <div className="inline-flex items-center gap-2.5 rounded-full bg-brand-500/15 px-5 py-2 text-xl font-semibold text-brand-200 ring-1 ring-brand-400/30 sm:text-2xl">
              <span className="relative flex size-3">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-70" />
                <span className="relative inline-flex size-3 rounded-full bg-brand-400" />
              </span>
              {t(lang, "displayNow")}
            </div>
            <div
              key={v.currentNumber ?? "none"}
              className="flex aspect-square w-[min(62vw,46vh,26rem)] animate-pop items-center justify-center rounded-full bg-[radial-gradient(circle_at_30%_25%,#34d399,#047857_70%)] shadow-[0_30px_80px_-20px_rgb(16_185_129/0.6),inset_0_-12px_40px_rgb(2_44_34/0.45)] ring-[10px] ring-white/10"
            >
              <span className="num text-[min(34vw,25vh,14rem)] leading-none font-bold drop-shadow-[0_6px_20px_rgb(2_44_34/0.5)]">
                {v.currentNumber ?? "—"}
              </span>
            </div>
            <p className="text-2xl font-semibold text-slate-200 sm:text-3xl">
              {v.currentNumber !== null ? t(lang, "dp_enter") : t(lang, "dp_soon")}
            </p>
          </div>
        </section>

        {/* العمود الجانبي */}
        <aside className="flex flex-col gap-5">
          <div className="rounded-[2rem] bg-white/[0.06] p-6 ring-1 ring-white/10">
            <div className="text-xl font-bold text-slate-200">{t(lang, "dp_upcoming")}</div>
            {first !== undefined ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-2xl bg-gradient-to-l from-brand-500/30 to-brand-500/10 px-6 py-4 ring-1 ring-brand-400/40 rtl:bg-gradient-to-r">
                  <span className="num text-6xl leading-none font-bold">{first}</span>
                  <span className="rounded-full bg-brand-400/20 px-3 py-1 text-sm font-bold text-brand-100">{t(lang, "db_upNext")}</span>
                </div>
                {rest.length > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    {rest.map((n) => (
                      <div key={n} className="num rounded-2xl bg-white/[0.05] py-3 text-center text-4xl font-bold text-slate-300 ring-1 ring-white/5">
                        {n}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-4 text-lg text-slate-400">{t(lang, "emptyQueue")}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-[1.5rem] bg-white/[0.06] p-5 ring-1 ring-white/10">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-400">
                <Users size={16} /> {t(lang, "waitingCount")}
              </div>
              <div className="num mt-1 text-5xl font-bold">{v.waiting}</div>
            </div>
            <div className="rounded-[1.5rem] bg-white/[0.06] p-5 ring-1 ring-white/10">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-400">
                <Clock3 size={16} /> {t(lang, "dp_avg")}
              </div>
              <div className="num mt-1 text-5xl font-bold">
                {t(lang, "dp_min", { n: v.avgServiceMin })}
              </div>
            </div>
          </div>

          <div className="mt-auto flex items-center gap-5 rounded-[2rem] bg-white p-5 text-ink shadow-[0_20px_50px_-20px_rgb(0_0_0/0.6)]">
            <div className="w-28 shrink-0 rounded-xl bg-white p-1 ring-4 ring-brand-100" dangerouslySetInnerHTML={{ __html: qr }} />
            <div>
              <div className="text-xl leading-snug font-bold">{t(lang, "posterTitle")}</div>
              <p className="mt-1 text-sm text-slate-600">{t(lang, "dp_scan")}</p>
            </div>
          </div>
        </aside>
      </div>

      <footer className="relative flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-6 py-4 text-sm text-slate-400 sm:px-10">
        <span className="flex items-center gap-2">
          <LogoMark size={18} /> {t(lang, "dp_footer")}
        </span>
        <span className="flex gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 ring-1 ring-white/15 hover:bg-white/10"
            onClick={() => {
              const on = !voice;
              setVoice(on);
              try {
                localStorage.setItem(VOICE_KEY, on ? "1" : "0");
              } catch {}
              unlockAudio();
              if (on && v.currentNumber !== null) announce(lang, v.currentNumber);
            }}
          >
            {voice ? <Volume2 size={16} /> : <VolumeX size={16} />} {t(lang, "dp_voice")}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 ring-1 ring-white/15 hover:bg-white/10"
            onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
          >
            <Maximize2 size={16} /> {t(lang, "dp_full")}
          </button>
        </span>
      </footer>

      {/* ——— نداء ملء الشاشة عند تغيّر الرقم ——— */}
      {callout !== null && (
        <div
          role="alert"
          className="fixed inset-0 z-50 flex animate-fade-up flex-col items-center justify-center gap-4 bg-[radial-gradient(circle_at_50%_40%,#065f46,#03241a_70%)] px-6 text-center"
          onClick={() => setCallout(null)}
        >
          <div className="text-[clamp(1.8rem,4vw,3.5rem)] font-bold text-brand-200">{t(lang, "dp_number")}</div>
          <div className="num animate-pop text-[min(55vw,55vh)] leading-[0.9] font-bold text-white drop-shadow-[0_20px_60px_rgb(16_185_129/0.55)]">
            {callout}
          </div>
          <div className="text-[clamp(1.8rem,4.5vw,4rem)] font-bold">{t(lang, "dp_enter")}</div>
          {doctor && (
            <div className="mt-2 inline-flex items-center gap-3 rounded-full bg-white/10 px-6 py-3 text-[clamp(1.2rem,2.6vw,2.2rem)] font-semibold text-brand-100">
              <Stethoscope size={28} /> {doctor}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
