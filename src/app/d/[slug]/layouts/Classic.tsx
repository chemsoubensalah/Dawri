"use client";
import { Clock3, Stethoscope, Users } from "lucide-react";
import SoundGate from "@/components/SoundGate";
import { LogoMark } from "@/components/ui";
import { t } from "@/lib/i18n";
import { CalloutOverlay, Controls } from "./shared";
import type { LayoutDef, LayoutProps } from "./types";

type ClassicSkin = "night" | "light" | "color";

/** أصناف كلّ تصميم من تصاميم الشاشة (يختاره الطبيب من الإعدادات). */
const SKINS = {
  // ليلي: داكن هادئ، مناسب للتلفاز في قاعة خافتة
  night: {
    main: "bg-[#061420] text-white",
    glow: "bg-[radial-gradient(60rem_35rem_at_15%_-10%,color-mix(in_srgb,var(--color-brand-500)_28%,transparent),transparent_60%),radial-gradient(50rem_30rem_at_100%_110%,rgb(14_165_233/0.18),transparent_60%)]",
    pattern: "opacity-[0.05] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:56px_56px]",
    line: "border-white/10",
    muted: "text-slate-400",
    accent: "text-brand-200",
    title: "text-slate-200",
    card: "bg-white/[0.06] ring-1 ring-white/10",
    band: "border-white/10 bg-gradient-to-l from-brand-500/20 to-transparent rtl:bg-gradient-to-r",
    docIcon: "bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-[0_10px_30px_-8px_color-mix(in_srgb,var(--color-brand-500)_70%,transparent)]",
    pill: "bg-brand-500/15 text-brand-200 ring-1 ring-brand-400/30",
    ball: "bg-[radial-gradient(circle_at_30%_25%,var(--color-brand-400),var(--color-brand-700)_70%)] text-white ring-white/10 shadow-[0_30px_80px_-20px_color-mix(in_srgb,var(--color-brand-500)_60%,transparent),inset_0_-12px_40px_rgb(0_0_0/0.25)]",
    enter: "text-slate-200",
    first: "bg-gradient-to-l from-brand-500/30 to-brand-500/10 ring-1 ring-brand-400/40 rtl:bg-gradient-to-r",
    badge: "bg-brand-400/20 text-brand-100",
    rest: "bg-white/[0.05] text-slate-300 ring-1 ring-white/5",
    btn: "ring-white/15 hover:bg-white/10",
    sound: "dark" as const,
  },
  // فاتح: أبيض نظيف، مناسب للقاعات المضيئة
  light: {
    main: "bg-[#f3f5f8] text-ink",
    glow: "bg-[radial-gradient(60rem_35rem_at_100%_-10%,color-mix(in_srgb,var(--color-brand-400)_22%,transparent),transparent_60%),radial-gradient(40rem_26rem_at_0%_110%,color-mix(in_srgb,var(--color-brand-300)_18%,transparent),transparent_60%)]",
    pattern: "",
    line: "border-slate-200",
    muted: "text-slate-500",
    accent: "text-brand-700",
    title: "text-ink",
    card: "bg-white ring-1 ring-slate-200 shadow-[0_12px_40px_-20px_rgb(15_23_42/0.25)]",
    band: "border-slate-100 bg-gradient-to-l from-brand-50 to-white rtl:bg-gradient-to-r",
    docIcon: "bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-(--shadow-brand)",
    pill: "bg-brand-50 text-brand-700 ring-1 ring-brand-200",
    ball: "bg-[radial-gradient(circle_at_30%_25%,var(--color-brand-400),var(--color-brand-700)_70%)] text-white ring-brand-100 shadow-[0_30px_70px_-25px_color-mix(in_srgb,var(--color-brand-600)_70%,transparent)]",
    enter: "text-slate-700",
    first: "bg-brand-50 text-brand-900 ring-1 ring-brand-200",
    badge: "bg-brand-600 text-white",
    rest: "bg-slate-100 text-slate-600",
    btn: "ring-slate-300 hover:bg-white",
    sound: "light" as const,
  },
  // ملوَّن: الشاشة كلّها بلون العيادة، أرقام بيضاء واضحة من بعيد
  color: {
    main: "bg-[linear-gradient(135deg,var(--color-brand-600),var(--color-brand-900))] text-white",
    glow: "bg-[radial-gradient(55rem_35rem_at_0%_0%,rgb(255_255_255/0.16),transparent_60%)]",
    pattern: "opacity-[0.09] [background-image:radial-gradient(#fff_1.2px,transparent_1.2px)] [background-size:26px_26px]",
    line: "border-white/15",
    muted: "text-white/70",
    accent: "text-brand-100",
    title: "text-white",
    card: "bg-white/10 ring-1 ring-white/20",
    band: "border-white/15 bg-white/10",
    docIcon: "bg-white text-brand-700",
    pill: "bg-white/15 text-white ring-1 ring-white/25",
    ball: "bg-white text-brand-700 ring-white/25 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.45)]",
    enter: "text-white",
    first: "bg-white text-brand-800",
    badge: "bg-brand-600 text-white",
    rest: "bg-white/10 text-white ring-1 ring-white/15",
    btn: "ring-white/25 hover:bg-white/10",
    sound: "dark" as const,
  },
} satisfies Record<ClassicSkin, Record<string, string>>;

/** «كلاسيكي»: الرقم في دائرة كبيرة + عمود جانبي (الأرقام القادمة، الإحصاءات، QR) — بثلاث روح: ليلي، فاتح، ملوَّن. */
function makeClassic(skin: ClassicSkin) {
  return function ClassicLayout({ lang, v, doctor, time, date, qr, callout, dismissCallout, voice, toggleVoice }: LayoutProps) {
    const k = SKINS[skin];
    const [first, ...rest] = v.nextNumbers;
    return (
    <main
      className={`relative flex min-h-dvh flex-col overflow-hidden ${k.main}`}
    >
      <div aria-hidden className={`pointer-events-none absolute inset-0 ${k.glow}`} />
      {k.pattern && <div aria-hidden className={`pointer-events-none absolute inset-0 ${k.pattern}`} />}

      {/* ——— الشريط العلوي ——— */}
      <header className={`relative flex items-center justify-between gap-4 border-b px-6 py-4 short:py-2.5 sm:px-10 ${k.line}`}>
        <div className="flex min-w-0 items-center gap-4 lg:max-w-[calc(50%-14rem)]">
          <LogoMark size={52} />
          <div className="min-w-0">
            <h1 className="line-clamp-2 pb-0.5 text-2xl leading-normal font-bold sm:truncate sm:text-3xl">{v.name}</h1>
            {v.profile.specialty && <p className={`truncate text-lg ${k.accent}`}>{v.profile.specialty}</p>}
          </div>
        </div>
        <div className="shrink-0 text-end">
          <div className="num text-4xl leading-none font-bold tracking-tight sm:text-5xl" dir="ltr">{time}</div>
          <div className={`mt-1 text-sm sm:text-base ${k.muted}`}>{date}</div>
        </div>
      </header>

      <div className="relative mx-auto w-full max-w-md px-6 pt-3 lg:absolute lg:top-3 lg:left-1/2 lg:z-10 lg:w-[26rem] lg:-translate-x-1/2 lg:px-0 lg:pt-0">
        <SoundGate lang={lang} tone={k.sound} />
      </div>

      {/* ——— المحتوى ——— */}
      <div className="relative grid min-h-0 flex-1 gap-6 px-6 py-6 short:gap-4 short:py-4 sm:px-10 lg:grid-cols-[1.55fr_1fr] lg:items-stretch">
        {/* الرقم الحالي */}
        <section className={`flex flex-col overflow-hidden rounded-[2.5rem] ${k.card}`}>
          {doctor && (
            <div className={`flex items-center gap-4 border-b px-7 py-5 short:py-3 ${k.band}`}>
              <span className={`inline-flex size-16 shrink-0 items-center justify-center rounded-2xl short:size-12 ${k.docIcon}`}>
                <Stethoscope size={32} />
              </span>
              <div className="min-w-0">
                <div className={`text-base font-semibold ${k.accent}`}>{t(lang, "dp_doctor")}</div>
                <div className="truncate pb-1 text-[clamp(1.8rem,3.6vw,3.4rem)] leading-[1.45] font-bold short:text-[clamp(1.5rem,5vh,2.6rem)]">{doctor}</div>
              </div>
            </div>
          )}
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-8 text-center short:gap-3 short:py-3">
            <div className={`inline-flex items-center gap-2.5 rounded-full px-5 py-2 text-xl font-semibold short:py-1.5 short:text-lg sm:text-2xl ${k.pill}`}>
              <span className="relative flex size-3">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
                <span className="relative inline-flex size-3 rounded-full bg-current" />
              </span>
              {t(lang, "displayNow")}
            </div>
            <div
              key={v.currentNumber ?? "none"}
              data-testid="display-number"
              className={`flex aspect-square w-[min(62vw,46vh,26rem)] animate-pop items-center justify-center rounded-full ring-[10px] short:w-[min(62vw,33vh,26rem)] short:ring-8 ${k.ball}`}
            >
              <span className="num text-[min(34vw,25vh,14rem)] leading-none font-bold short:text-[min(34vw,18vh,14rem)]">{v.currentNumber ?? <span className="text-[0.35em] opacity-50">· · ·</span>}</span>
            </div>
            <p className={`text-2xl font-semibold short:text-xl sm:text-3xl ${k.enter}`}>
              {v.currentNumber !== null ? t(lang, "dp_enter") : t(lang, "dp_soon")}
            </p>
          </div>
        </section>

        {/* العمود الجانبي */}
        <aside className="flex min-h-0 flex-col gap-5 short:gap-3">
          <div className={`rounded-[2rem] p-6 short:p-4 ${k.card}`}>
            <div className={`text-xl font-bold short:text-lg ${k.title}`}>{t(lang, "dp_upcoming")}</div>
            {first !== undefined ? (
              <div className="mt-4 space-y-3 short:mt-3 short:space-y-2">
                <div className={`flex items-center justify-between rounded-2xl px-6 py-4 short:py-2.5 ${k.first}`}>
                  <span className="num text-6xl leading-none font-bold short:text-5xl">{first}</span>
                  <span className={`rounded-full px-3 py-1 text-sm font-bold ${k.badge}`}>{t(lang, "db_upNext")}</span>
                </div>
                {rest.length > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    {rest.map((n) => (
                      <div key={n} className={`num rounded-2xl py-3 text-center text-4xl font-bold short:py-1.5 short:text-3xl ${k.rest}`}>
                        {n}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className={`mt-4 text-lg ${k.muted}`}>{t(lang, "emptyQueue")}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 short:gap-3">
            <div className={`rounded-[1.5rem] p-5 short:p-3.5 ${k.card}`}>
              <div className={`flex items-center gap-2 text-sm font-semibold ${k.muted}`}>
                <Users size={16} /> {t(lang, "waitingCount")}
              </div>
              <div className="num mt-1 text-5xl font-bold short:text-4xl">{v.waiting}</div>
            </div>
            <div className={`rounded-[1.5rem] p-5 short:p-3.5 ${k.card}`}>
              <div className={`flex items-center gap-2 text-sm font-semibold ${k.muted}`}>
                <Clock3 size={16} /> {t(lang, "dp_avg")}
              </div>
              <div className="num mt-1 text-5xl font-bold short:text-4xl">{t(lang, "dp_min", { n: v.avgServiceMin })}</div>
            </div>
          </div>

          <div className="mt-auto flex items-center gap-5 rounded-[2rem] bg-white p-5 short:gap-4 short:p-3.5 text-ink shadow-[0_20px_50px_-20px_rgb(0_0_0/0.45)] ring-1 ring-slate-200/60">
            <div className="w-28 shrink-0 rounded-xl bg-white p-1 ring-4 ring-brand-100 short:w-20" dangerouslySetInnerHTML={{ __html: qr }} />
            <div>
              <div className="text-xl leading-snug font-bold text-balance">{t(lang, "posterTitle").replace(" —", "\u00a0—")}</div>
              <p className="mt-1 text-sm text-slate-600">{t(lang, "dp_scan")}</p>
            </div>
          </div>
        </aside>
      </div>

      <footer className={`relative flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4 text-sm short:py-2 sm:px-10 ${k.line} ${k.muted}`}>
        <span className="flex items-center gap-2">
          <LogoMark size={18} /> {t(lang, "dp_footer")}
        </span>
        <Controls lang={lang} voice={voice} toggleVoice={toggleVoice} tone={k.sound} />
      </footer>

      {callout !== null && <CalloutOverlay lang={lang} n={callout} doctor={doctor} onClose={dismissCallout} variant={skin === "night" ? "dark" : skin} />}
    </main>
    );
  };
}

function makeThumb(skin: ClassicSkin) {
  return function ClassicThumb() {
    const bg =
      skin === "night"
        ? "bg-[#061420]"
        : skin === "light"
          ? "bg-[#eef1f5]"
          : "bg-[linear-gradient(135deg,var(--color-brand-600),var(--color-brand-900))]";
    const card = skin === "light" ? "bg-white ring-1 ring-slate-200" : skin === "night" ? "bg-white/10" : "bg-white/15";
    const ball =
      skin === "color"
        ? "bg-white text-brand-700"
        : "bg-[radial-gradient(circle_at_30%_25%,var(--color-brand-400),var(--color-brand-700)_70%)] text-white";
    const bar = skin === "light" ? "bg-slate-300" : "bg-white/40";
    return (
      <div className={`relative aspect-video w-full overflow-hidden rounded-xl p-2 ${bg}`} aria-hidden>
        <div className="flex items-center justify-between">
          <span className={`h-1.5 w-10 rounded-full ${bar}`} />
          <span className={`h-1.5 w-5 rounded-full ${bar}`} />
        </div>
        <div className="mt-1.5 grid h-[calc(100%-0.875rem)] grid-cols-[1.5fr_1fr] gap-1.5">
          <div className={`flex items-center justify-center rounded-lg ${card}`}>
            <span className={`num flex size-9 items-center justify-center rounded-full text-sm font-bold ${ball}`}>12</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className={`flex-1 rounded-lg ${card}`} />
            <div className="flex-1 rounded-lg bg-white" />
          </div>
        </div>
      </div>
    );
  };
}

export const night: LayoutDef = { Layout: makeClassic("night"), Thumb: makeThumb("night") };
export const light: LayoutDef = { Layout: makeClassic("light"), Thumb: makeThumb("light") };
export const color: LayoutDef = { Layout: makeClassic("color"), Thumb: makeThumb("color") };
