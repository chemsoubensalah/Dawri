"use client";
import { useEffect, useRef, useState } from "react";
import { Maximize2, Megaphone, Volume2, VolumeX } from "lucide-react";
import SoundGate from "@/components/SoundGate";
import { LogoMark } from "@/components/ui";
import type { Lang } from "@/lib/domain/types";
import { t } from "@/lib/i18n";
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
  const [voice, setVoice] = useState(false);
  const last = useRef(initial.currentNumber);

  usePoll(async () => setV(await api<PublicShopView>(`/api/s/${v.slug}`)), 4000);

  useEffect(() => {
    try {
      setVoice(localStorage.getItem(VOICE_KEY) === "1");
    } catch {}
    const fmt = new Intl.DateTimeFormat("fr-DZ", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Algiers" });
    const tick = () => setTime(fmt.format(new Date()));
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (v.currentNumber !== last.current && v.currentNumber !== null) {
      playSound("next");
      if (voice) announce(lang, v.currentNumber);
    }
    last.current = v.currentNumber;
  }, [v.currentNumber, voice, lang]);

  const sub = [v.profile.doctorName, v.profile.specialty].filter(Boolean).join(" · ");

  return (
    <main className="flex min-h-dvh flex-col bg-[radial-gradient(80rem_40rem_at_50%_-10%,#065f46_0%,#0b1b2b_55%)] text-white">
      <header className="flex items-center justify-between gap-4 px-6 py-5 sm:px-10">
        <div className="flex min-w-0 items-center gap-4">
          <LogoMark size={48} />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold sm:text-3xl">{v.name}</h1>
            {sub && <p className="truncate text-brand-200">{sub}</p>}
          </div>
        </div>
        <div className="num text-4xl font-bold text-slate-200 sm:text-5xl">{time}</div>
      </header>

      <div className="mx-auto w-full max-w-md px-6">
        <SoundGate lang={lang} />
      </div>

      <div className="grid flex-1 items-center gap-8 px-6 pb-6 sm:px-10 lg:grid-cols-[1.6fr_1fr]">
        <section className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2 text-xl font-semibold text-brand-200 sm:text-2xl">
            <Megaphone size={24} /> {t(lang, "displayNow")}
          </div>
          <div key={v.currentNumber ?? "none"} className="num animate-pop text-[min(38vw,22rem)] leading-none font-bold drop-shadow-[0_10px_40px_rgba(16,185,129,0.35)]">
            {v.currentNumber ?? "—"}
          </div>
          <p className="text-xl text-slate-300 sm:text-2xl">{v.currentNumber !== null ? t(lang, "dp_enter") : t(lang, "dp_soon")}</p>
        </section>

        <aside className="space-y-5">
          <div className="rounded-3xl bg-white/[0.07] p-6 ring-1 ring-white/10">
            <div className="text-lg font-semibold text-slate-300">{t(lang, "displayNext")}</div>
            {v.nextNumbers.length ? (
              <ol className="mt-3 space-y-2">
                {v.nextNumbers.map((n, i) => (
                  <li key={n} className={`num flex items-center justify-between rounded-2xl px-5 py-3 text-4xl font-bold ${i === 0 ? "bg-brand-500/20 text-white ring-1 ring-brand-400/40" : "bg-white/5 text-slate-300"}`}>
                    {n}
                    {i === 0 && <span className="text-sm font-semibold text-brand-200">{t(lang, "db_upNext")}</span>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-slate-400">{t(lang, "emptyQueue")}</p>
            )}
            <p className="mt-4 text-slate-400">
              {t(lang, "waitingCount")}: <b className="num text-white">{v.waiting}</b>
            </p>
          </div>
          <div className="flex items-center gap-5 rounded-3xl bg-white p-5 text-ink">
            <div className="w-28 shrink-0" dangerouslySetInnerHTML={{ __html: qr }} />
            <div>
              <div className="text-xl font-bold">{t(lang, "posterTitle")}</div>
              <p className="mt-1 text-sm text-slate-600">{t(lang, "dp_scan")}</p>
            </div>
          </div>
        </aside>
      </div>

      <footer className="flex items-center justify-between gap-3 px-6 pb-5 text-sm text-slate-400 sm:px-10">
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
    </main>
  );
}
