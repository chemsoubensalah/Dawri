"use client";
import { useEffect, useRef, useState } from "react";
import { Maximize } from "lucide-react";
import SoundGate from "@/components/SoundGate";
import MessageTicker from "@/app/d/[slug]/MessageTicker";
import { LogoMark } from "@/components/ui";
import type { Lang } from "@/lib/domain/types";
import { themeVars } from "@/lib/theme";
import { dirOf, drTitle, t } from "@/lib/i18n";
import { api, playSound, usePoll } from "@/lib/client";
import type { ClinicPublicView, PublicDoctor } from "@/lib/server/clinics";

interface Callout {
  key: string;
  number: number;
  doctor: string;
  room: string | null;
}

const CALLOUT_MS = 6000;

/**
 * شاشة القاعة المشتركة: شبكة داكنة (1–8 أطبّاء). عند تغيّر رقم أيّ طبيب: صوت + إعلان كبير 6 ثوانٍ
 * (تُصفّ الإعلانات المتتالية). أرقام فقط.
 */
export default function ClinicTv({ lang, initial, qr }: { lang: Lang; initial: ClinicPublicView; qr: string }) {
  const [view, setView] = useState(initial);
  const [queue, setQueue] = useState<Callout[]>([]);
  const [clock, setClock] = useState("");
  const last = useRef<Map<string, number | null>>(new Map(initial.doctors.map((d) => [d.slug, d.currentNumber])));

  usePoll(async () => {
    const v = await api<ClinicPublicView>(`/api/c/${initial.clinic.slug}`);
    const fresh: Callout[] = [];
    for (const d of v.doctors) {
      const prev = last.current.get(d.slug);
      if (d.currentNumber != null && prev !== undefined && prev !== d.currentNumber) {
        fresh.push({ key: `${d.slug}:${d.currentNumber}:${Date.now()}`, number: d.currentNumber, doctor: title(d), room: d.room });
      }
      last.current.set(d.slug, d.currentNumber);
    }
    setView(v);
    if (fresh.length) setQueue((q) => [...q, ...fresh].slice(-8));
  }, 5000);

  function title(d: PublicDoctor) {
    return drTitle(lang, d.kind, d.doctorName) ?? d.name;
  }

  // إعلان واحد في كلّ مرّة: صوت ثمّ 6 ثوانٍ ثمّ التالي
  const current = queue[0];
  useEffect(() => {
    if (!current) return;
    playSound("next");
    const id = setTimeout(() => setQueue((q) => q.slice(1)), CALLOUT_MS);
    return () => clearTimeout(id);
  }, [current?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tick = () =>
      setClock(new Intl.DateTimeFormat("fr-DZ", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Algiers", hour12: false }).format(new Date()));
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  const n = view.doctors.length;
  const cols = n <= 1 ? "grid-cols-1" : n <= 2 ? "grid-cols-1 sm:grid-cols-2" : n <= 4 ? "grid-cols-1 sm:grid-cols-2" : n <= 6 ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-2 lg:grid-cols-4";
  const big = n <= 2 ? "text-[clamp(5rem,16vw,14rem)]" : n <= 4 ? "text-[clamp(4rem,10vw,9rem)]" : "text-[clamp(3rem,7vw,6.5rem)]";

  return (
    <div className="flex min-h-dvh flex-col bg-[#0a0f1a] text-white" dir={dirOf(lang)} lang={lang} style={themeVars(view.clinic.look)} data-testid="clinic-tv">
      <header className="flex items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <LogoMark size={40} />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-2xl font-bold sm:text-3xl">{view.clinic.name}</p>
            <p className="text-sm text-slate-400">{t(lang, "cl_tvSub")}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="num text-3xl font-bold text-slate-200 sm:text-4xl" dir="ltr">{clock}</span>
          <button
            type="button"
            className="rounded-xl p-2 text-slate-400 ring-1 ring-white/10 hover:bg-white/5 hover:text-white"
            onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
            aria-label={t(lang, "cl_fullscreen")}
          >
            <Maximize size={20} />
          </button>
        </div>
      </header>

      <div className="px-5 sm:px-8">
        <SoundGate lang={lang} tone="dark" />
      </div>

      <main className={`grid flex-1 gap-4 p-5 sm:p-8 ${cols}`}>
        {n === 0 && <p className="self-center text-center text-2xl text-slate-400">{t(lang, "cl_noDoctors")}</p>}
        {view.doctors.map((d) => {
          const flash = current && current.doctor === title(d) && current.number === d.currentNumber;
          const off = d.status !== "open";
          return (
            <section
              key={d.slug}
              className={`flex flex-col rounded-3xl p-5 ring-1 transition sm:p-6 ${
                flash ? "bg-brand-600/25 ring-brand-400" : "bg-white/[0.04] ring-white/10"
              }`}
              data-testid="tv-tile"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 leading-snug">
                  <p className="truncate text-xl font-bold sm:text-2xl">{title(d)}</p>
                  {d.specialty && <p className="truncate text-sm text-slate-400">{d.specialty}</p>}
                </div>
                {d.room && <span className="shrink-0 rounded-xl bg-brand-500/15 px-3 py-1.5 text-base font-bold text-brand-300">{d.room}</span>}
              </div>
              <div className="flex flex-1 flex-col items-center justify-center py-4">
                <p className="text-sm tracking-wide text-slate-400">{t(lang, "cl_nowServing")}</p>
                <p className={`num leading-none font-black ${big} ${off ? "text-slate-600" : "text-white"}`} dir="ltr">
                  {d.currentNumber ?? <span className="text-[0.35em] font-bold text-slate-600">· · ·</span>}
                </p>
                {off && <p className="mt-2 text-base font-semibold text-amber-300/90">{t(lang, `cl_st_${d.status}`)}</p>}
              </div>
              <div className="flex items-center gap-2 border-t border-white/10 pt-3">
                <span className="text-sm text-slate-400">{t(lang, "cl_nextNumbers")}</span>
                <span className="flex flex-wrap gap-1.5" dir="ltr">
                  {d.nextNumbers.length ? (
                    d.nextNumbers.map((x) => (
                      <span key={x} className="num rounded-lg bg-white/10 px-2.5 py-0.5 text-lg font-bold text-slate-100">{x}</span>
                    ))
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </span>
              </div>
            </section>
          );
        })}
      </main>

      {view.messages?.length > 0 && (
        <div className="dw-tk-solo mx-5 mb-4 overflow-hidden rounded-2xl sm:mx-8">
          <MessageTicker messages={view.messages} />
        </div>
      )}

      <footer className="flex items-center justify-between gap-4 px-5 pb-5 sm:px-8">
        <p className="text-lg text-slate-300">{t(lang, "cl_tvScan")}</p>
        <div className="size-20 shrink-0 rounded-xl bg-white p-1.5" dangerouslySetInnerHTML={{ __html: qr }} />
      </footer>

      {current && (
        <div className="fixed inset-0 z-50 flex animate-fade-up items-center justify-center bg-[#0a0f1a]/92 p-6 backdrop-blur-sm" role="alert" aria-live="assertive" data-testid="tv-callout">
          <div className="w-full max-w-4xl rounded-[2.5rem] bg-gradient-to-br from-brand-600 to-brand-800 p-10 text-center shadow-2xl ring-4 ring-brand-300/40">
            <p className="text-3xl font-bold text-brand-100 sm:text-4xl">{t(lang, "cl_number")}</p>
            <p className="num my-2 text-[clamp(7rem,22vw,16rem)] leading-none font-black" dir="ltr">{current.number}</p>
            <p className="text-3xl leading-snug font-bold sm:text-5xl">{current.doctor}</p>
            {current.room && (
              <p className="mt-4 inline-block rounded-2xl bg-white/15 px-6 py-2 text-3xl font-bold sm:text-4xl">{current.room}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
