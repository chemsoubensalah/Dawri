"use client";
import type { ReactNode } from "react";
import { ArrowRight, Hourglass, Stethoscope, Ticket, Users } from "lucide-react";
import SoundGate from "@/components/SoundGate";
import { LogoMark } from "@/components/ui";
import type { Lang } from "@/lib/domain/types";
import { errorText, t, type DictKey } from "@/lib/i18n";
import { Controls } from "./shared";
import type { LayoutDef, LayoutProps } from "./types";

/**
 * «لوحة المطار»: لوحة رحلات بألواح قلّابة (Solari).
 * شريط لافتة بلون العيادة، ثمّ صفّ مميّز للرقم الحالي بألواح عملاقة، ثمّ جدول الأرقام القادمة
 * بحالاتها وانتظارها المتوقّع، وبطاقة صعود بيضاء تحمل رمز QR.
 */

// ————————————————————————— نصوص التصميم —————————————————————————

type BoardKey = "inside" | "standby" | "next" | "ready" | "queued" | "status" | "eta" | "pass";
const tb = (lang: Lang, k: BoardKey) => t(lang, `lay_board_${k}` as DictKey);

// ————————————————————————— الألواح القلّابة —————————————————————————

type Face = "amber" | "white";
const INK: Record<Face, string> = { amber: "text-[#ffcc33]", white: "text-[#f4f5f6]" };
const GHOST: Record<Face, string> = { amber: "text-[#ffcc33]/[0.09]", white: "text-white/[0.1]" };

/** وجه اللوح: نصف علوي أفتح، نصف سفلي أغمق، وظلّ داخلي خفيف — كلّه بوحدة em فيكبر مع الخطّ. */
const FACE =
  "rounded-[0.08em] bg-[linear-gradient(180deg,#2d3137_0%,#24282d_50%,#1b1e22_50%,#141619_100%)] shadow-[inset_0_0.02em_0_rgb(255_255_255/0.09),inset_0_-0.05em_0.08em_rgb(0_0_0/0.45),0_0.03em_0.05em_rgb(0_0_0/0.55)]";
const TILE = "relative h-[1.12em] w-[0.74em] shrink-0";
/** شقّ المفصل الأفقي الذي يقطع الحرف — علامة اللوح القلّاب. */
const SPLIT =
  "pointer-events-none absolute inset-x-0 top-1/2 h-[0.016em] min-h-px -translate-y-1/2 bg-black/90 shadow-[0_0.012em_0_rgb(255_255_255/0.07)]";

type Glyph = { ch: string; ghost?: boolean };

/** لوح واحد. ghost = صفر بادئ باهت يُرسم بـ CSS (فلا يدخل في نصّ الرقم). flipKey = يقلب عند تغيّره. */
function Flap({ g, face, flipKey, delay = 0 }: { g: Glyph; face: Face; flipKey?: string; delay?: number }) {
  const glyph = g.ghost ? (
    <span className={`num leading-none font-bold before:content-['0'] ${GHOST[face]}`} />
  ) : (
    <span className={`num leading-none font-bold ${INK[face]}`}>{g.ch}</span>
  );
  if (flipKey === undefined) {
    return (
      <span className={`${TILE} inline-flex items-center justify-center ${FACE}`}>
        {glyph}
        <span aria-hidden className={SPLIT} />
      </span>
    );
  }
  return (
    <span className={`${TILE} inline-block rounded-[0.08em] bg-black/70`}>
      <span
        key={flipKey}
        className={`absolute inset-0 flex items-center justify-center ${FACE} motion-safe:animate-[dw-board-flip_0.7s_ease-out_both]`}
        style={{ animationDelay: `${delay}ms` }}
      >
        {glyph}
      </span>
      <span aria-hidden className={SPLIT} />
    </span>
  );
}

/** رقم على ألواح بعرض ثابت (7 ← 0 0 7، الأصفار باهتة). null ← ألواح فارغة كلوحة تنتظر التحديث. */
function glyphs(n: number | null, width: number): Glyph[] {
  if (n === null) return Array.from({ length: width }, () => ({ ch: "" }));
  const s = String(n);
  const pad = Math.max(0, width - s.length);
  return [...Array.from({ length: pad }, () => ({ ch: "0", ghost: true })), ...[...s].map((ch) => ({ ch }))];
}

function Flaps({
  items,
  face,
  flipKey,
  className = "",
}: {
  items: Glyph[];
  face: Face;
  flipKey?: string;
  className?: string;
}) {
  return (
    <span dir="ltr" className={`flex w-max gap-[0.06em] ${className}`}>
      {items.map((g, i) => (
        <Flap key={i} g={g} face={face} flipKey={flipKey} delay={i * 110} />
      ))}
    </span>
  );
}

/** الساعة على ألواح بيضاء، والنقطتان بين الساعات والدقائق. */
function Clock({ time, className = "" }: { time: string; className?: string }) {
  const s = time || "--:--";
  return (
    <span dir="ltr" className={`flex w-max items-center gap-[0.06em] ${className}`}>
      {[...s].map((ch, i) =>
        ch === ":" ? (
          <span key={i} aria-hidden className="flex flex-col gap-[0.2em] px-[0.06em]">
            <span className="size-[0.11em] rounded-full bg-white/90" />
            <span className="size-[0.11em] rounded-full bg-white/90" />
          </span>
        ) : (
          <Flap key={i} g={{ ch: ch === "-" ? "" : ch }} face="white" />
        ),
      )}
    </span>
  );
}

// ————————————————————————— خانات الحالة —————————————————————————

type Tone = "live" | "next" | "ready" | "wait";
const TONES: Record<Tone, { text: string; led: string }> = {
  live: { text: "text-[#4ade80]", led: "bg-[#4ade80] shadow-[0_0_0.7em_#4ade80] motion-safe:animate-pulse" },
  next: { text: "text-[#ffcc33]", led: "bg-[#ffcc33] shadow-[0_0_0.6em_rgb(255_204_51/0.7)]" },
  ready: { text: "text-white", led: "bg-white shadow-[0_0_0.5em_rgb(255_255_255/0.55)]" },
  wait: { text: "text-white/60", led: "bg-white/30" },
};

/** خانة حالة كما في لوحات المطار: أرضيّة سوداء، مصباح صغير، نصّ ملوّن. */
function Status({ tone, children, className = "" }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-[0.6em] rounded-[0.3em] bg-black/50 px-[0.8em] py-[0.32em] leading-normal font-semibold ring-1 ring-white/[0.07] ${TONES[tone].text} ${className}`}
    >
      <span className={`size-[0.55em] shrink-0 rounded-full ${TONES[tone].led}`} />
      <span className="min-w-0 truncate sm:ltr:tracking-[0.06em] sm:ltr:uppercase">{children}</span>
    </span>
  );
}

/** مربّع الاتّجاه (كلافتات «البوّابة ←»): سهم يشير إلى الأمام حسب اتّجاه اللغة. */
function SignArrow({ on }: { on: boolean }) {
  return (
    <span
      className={`grid size-[1.1em] shrink-0 place-items-center rounded-[0.18em] ${on ? "bg-brand-600 text-white" : "bg-white/10 text-white/70"}`}
    >
      {on ? (
        <ArrowRight className="size-[0.7em] rtl:-scale-x-100" strokeWidth={2.75} />
      ) : (
        <Hourglass className="size-[0.55em]" strokeWidth={2.25} />
      )}
    </span>
  );
}

function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[0.6em] leading-normal font-semibold text-[#ffcc33] ltr:tracking-[0.14em] ltr:uppercase ${className}`}>
      <span className="h-[1em] w-[0.28em] rounded-[0.08em] bg-[#ffcc33]" />
      {children}
    </span>
  );
}

// ————————————————————————— أجزاء الشاشة —————————————————————————

const PANEL =
  "bg-[#15181c] ring-1 ring-white/[0.07] shadow-[inset_0_1px_0_rgb(255_255_255/0.04),0_24px_48px_-28px_rgb(0_0_0/0.9)]";
/** شريط اللافتة بلون العيادة (يُعكس التدرّج بالعربية). */
const SIGN =
  "bg-[linear-gradient(90deg,var(--color-brand-800),var(--color-brand-700)_45%)] shadow-[inset_0_1px_0_rgb(255_255_255/0.12),inset_0_-1px_0_rgb(0_0_0/0.35)] rtl:bg-[linear-gradient(270deg,var(--color-brand-800),var(--color-brand-700)_45%)]";
/** أعمدة الجدول بوحدة em لحجم خطّ الصفّ، فتبقى الأعمدة متطابقة. */
const COLS =
  "grid grid-cols-[2.45em_minmax(0,1fr)_2.1em] items-center gap-x-[0.35em] px-[0.35em] sm:grid-cols-[2.45em_minmax(0,1fr)_2.6em] sm:gap-x-[0.45em] sm:px-[0.45em]";
const ROWS: { key: BoardKey; tone: Tone }[] = [
  { key: "next", tone: "next" },
  { key: "ready", tone: "ready" },
  { key: "queued", tone: "wait" },
];

function Pictogram({ className = "" }: { className?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center bg-white text-brand-800 shadow-[0_0.15rem_0_rgb(0_0_0/0.25)] ${className}`}>
      <Stethoscope className="size-[58%]" strokeWidth={2.2} />
    </span>
  );
}

function Header({ lang, v, doctor, time, date }: Pick<LayoutProps, "lang" | "v" | "doctor" | "time" | "date">) {
  const sub = [v.profile.specialty, doctor ? v.name : null].filter(Boolean).join(" · ");
  return (
    <header
      className={`relative z-10 flex flex-wrap items-center gap-x-[clamp(0.75rem,2vw,2rem)] gap-y-3 px-4 py-3 text-white sm:px-6 lg:landscape:flex-nowrap lg:landscape:gap-x-[1.6vw] lg:landscape:px-[2.5vw] lg:landscape:py-[1.5vh] ${SIGN}`}
    >
      <Pictogram className="size-[clamp(3rem,8.5vw,5.75rem)] rounded-[clamp(0.6rem,1.4vw,1rem)] lg:landscape:size-[8.2vh] lg:landscape:rounded-[1.3vh]" />
      <div className="min-w-0 flex-1">
        <h1 className="pb-0.5 text-[clamp(1.25rem,4.4vw,3rem)] leading-[1.35] font-bold break-words lg:landscape:text-[clamp(1.4rem,4.4vh,3.2rem)] lg:landscape:leading-[1.3]">
          {doctor ?? v.name}
        </h1>
        {sub && (
          <p className="text-[clamp(0.85rem,2.4vw,1.6rem)] leading-normal text-white/80 lg:landscape:text-[clamp(0.9rem,2.2vh,1.5rem)]">{sub}</p>
        )}
      </div>
      {/* يظهر فقط ما دام الصوت مقفلاً — في الشريط نفسه كي لا يدفع اللوحة */}
      <div className="order-last min-w-0 basis-full empty:hidden lg:landscape:order-none lg:landscape:w-[min(26rem,30vw)] lg:landscape:shrink-0 lg:landscape:basis-auto">
        <SoundGate lang={lang} tone="dark" />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Clock time={time} className="text-[clamp(1.6rem,5.2vw,3.4rem)] lg:landscape:text-[5.4vh]" />
        <span className="text-[clamp(0.75rem,2vw,1.3rem)] leading-normal text-white/80 lg:landscape:text-[clamp(0.8rem,2vh,1.3rem)]">{date}</span>
      </div>
    </header>
  );
}

/** الصفّ المميّز: الرقم الحالي بألواح عملاقة + حالته. */
function NowRow({ lang, cur, flipKey }: { lang: Lang; cur: number | null; flipKey: string }) {
  const on = cur !== null;
  return (
    <div className="relative flex flex-1 flex-col justify-center gap-4 bg-[radial-gradient(70%_100%_at_25%_0%,color-mix(in_srgb,var(--color-brand-500)_13%,transparent),transparent_70%)] px-4 pt-4 pb-6 sm:px-8 sm:pt-6 lg:landscape:min-h-0 lg:landscape:gap-[1.8vh] lg:landscape:px-[2vw] lg:landscape:py-[2vh] rtl:bg-[radial-gradient(70%_100%_at_75%_0%,color-mix(in_srgb,var(--color-brand-500)_13%,transparent),transparent_70%)]">
      <Eyebrow className="text-[clamp(0.9rem,2.4vw,1.6rem)] lg:landscape:text-[clamp(0.9rem,2.4vh,1.6rem)]">{t(lang, "displayNow")}</Eyebrow>
      <div className="flex flex-col items-center gap-5 lg:landscape:flex-row lg:landscape:justify-between lg:landscape:gap-[2vw]">
        <div data-testid="display-number" className="text-[min(34vw,30vh)] portrait:sm:text-[min(37vw,26vh)] lg:landscape:text-[min(31vh,19vw)]">
          <Flaps items={glyphs(cur, 3)} face="amber" flipKey={flipKey} />
          {!on && <span className="sr-only">—</span>}
        </div>
        <div className="flex min-w-0 flex-col items-center gap-3 text-center lg:landscape:items-start lg:landscape:gap-[2.2vh] lg:landscape:text-start">
          <Status tone={on ? "live" : "wait"} className="text-[clamp(1rem,3vw,1.75rem)] lg:landscape:text-[clamp(1rem,2.8vh,1.9rem)]">
            {tb(lang, on ? "inside" : "standby")}
          </Status>
          <p
            className={`flex items-center gap-[0.45em] leading-[1.4] font-bold text-white ${
              on
                ? "text-[clamp(1.6rem,6vw,3.6rem)] lg:landscape:text-[clamp(1.5rem,4.8vh,3.4rem)]"
                : "text-[clamp(1.3rem,4.6vw,2.8rem)] lg:landscape:text-[clamp(1.2rem,4vh,2.8rem)]"
            }`}
          >
            <SignArrow on={on} />
            <span className="min-w-0">{t(lang, on ? "dp_enter" : "dp_soon")}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

/** جدول القادمين: الرقم | الحالة | الانتظار المتوقّع (= الترتيب × مدّة الكشف). */
function NextTable({ lang, next, avg }: { lang: Lang; next: number[]; avg: number }) {
  const unit = t(lang, "dp_min", { n: "" }).trim();
  return (
    <div className="border-t-2 border-black/70 text-[min(9.5vw,4.2rem)] lg:landscape:text-[min(6.3vh,3.5vw)]">
      <div className={`${COLS} py-[0.16em] text-white/50`}>
        {[t(lang, "dp_number"), tb(lang, "status"), tb(lang, "eta")].map((h, i) => (
          <span
            key={h}
            className={`text-[0.3em] leading-normal font-semibold whitespace-nowrap ltr:tracking-[0.12em] ltr:uppercase ${i === 2 ? "justify-self-end" : ""}`}
          >
            {h}
          </span>
        ))}
      </div>
      {ROWS.map((r, i) => {
        const n = next[i];
        const empty = i === 0 && next.length === 0;
        return (
          <div key={r.key} className={`${COLS} border-t border-white/[0.06] py-[0.12em] even:bg-white/[0.015]`}>
            <Flaps items={glyphs(n ?? null, 3)} face="white" />
            <span className="flex min-w-0">
              {n !== undefined ? (
                <Status tone={r.tone} className="text-[0.36em]">
                  {tb(lang, r.key)}
                </Status>
              ) : empty ? (
                <Status tone="wait" className="text-[0.36em]">
                  {t(lang, "emptyQueue")}
                </Status>
              ) : null}
            </span>
            <span className="flex items-center justify-end gap-[0.1em]">
              <Flaps items={glyphs(n !== undefined && avg > 0 ? (i + 1) * avg : null, 2)} face="white" className="text-[0.5em] sm:text-[0.6em]" />
              <span className={`text-[0.3em] leading-normal font-semibold text-white/55 ${n === undefined || avg <= 0 ? "invisible" : ""}`}>{unit}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** لوحة الأرقام الصغيرة: في الانتظار + مدّة الكشف. */
function Stats({ lang, waiting, avg }: { lang: Lang; waiting: number; avg: number }) {
  const unit = t(lang, "dp_min", { n: "" }).trim();
  const cell = "flex flex-col justify-center gap-2 p-4 sm:p-5 lg:landscape:gap-[1vh] lg:landscape:p-[1.8vh]";
  const label =
    "flex items-center gap-2 text-[clamp(0.8rem,2vw,1.2rem)] leading-normal font-semibold text-white/55 lg:landscape:text-[clamp(0.8rem,1.9vh,1.2rem)]";
  const value = "flex items-end gap-[0.12em] text-[clamp(2.2rem,6.5vw,4.25rem)] lg:landscape:text-[5.4vh]";
  return (
    <div className={`grid grid-cols-2 overflow-hidden rounded-2xl portrait:sm:grid-cols-1 lg:landscape:rounded-[1.6vh] ${PANEL}`}>
      <div className={cell}>
        <span className={label}>
          <Users className="size-[1.1em] shrink-0" /> {t(lang, "waitingCount")}
        </span>
        <span className={value}>
          <Flaps items={glyphs(waiting, 2)} face="white" />
        </span>
      </div>
      <div className={`border-s border-white/[0.06] portrait:sm:border-s-0 portrait:sm:border-t ${cell}`}>
        <span className={label}>
          <Hourglass className="size-[1.1em] shrink-0" /> {t(lang, "dp_avg")}
        </span>
        <span className={value}>
          <Flaps items={glyphs(avg > 0 ? avg : null, 2)} face="white" />
          <span className="pb-[0.1em] text-[0.36em] leading-normal font-semibold text-white/60">{unit}</span>
        </span>
      </div>
    </div>
  );
}

/** بطاقة صعود بيضاء: «خذ رقمك» + QR، وتخريم بين الجزأين. */
function Pass({ lang, qr, blocker }: { lang: Lang; qr: string; blocker: string | null }) {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl bg-white text-ink shadow-[0_24px_48px_-24px_rgb(0_0_0/0.8)] lg:landscape:min-h-0 lg:landscape:flex-1 lg:landscape:rounded-[1.6vh]">
      <div className="px-5 pt-5 pb-4 sm:px-6 lg:landscape:px-[1.4vw] lg:landscape:pt-[2.2vh] lg:landscape:pb-[1.6vh]">
        <div className="flex items-center gap-2 text-[clamp(0.75rem,1.8vw,1.1rem)] leading-normal font-bold text-brand-700 ltr:tracking-[0.12em] ltr:uppercase lg:landscape:text-[clamp(0.75rem,1.7vh,1.1rem)]">
          <Ticket className="size-[1.25em] shrink-0" /> {tb(lang, "pass")}
        </div>
        <p className="mt-1.5 text-[clamp(1.05rem,2.8vw,1.75rem)] leading-normal font-bold lg:landscape:text-[clamp(1rem,2.6vh,1.7rem)]">
          {t(lang, "posterTitle")}
        </p>
      </div>
      {/* التخريم: خطّ متقطّع وثلمتان بلون اللوحة */}
      <div aria-hidden className="relative h-5 shrink-0">
        <span className="absolute inset-x-6 top-1/2 border-t-2 border-dashed border-slate-200" />
        <span className="absolute -start-2.5 top-0 size-5 rounded-full bg-[#0f1113]" />
        <span className="absolute -end-2.5 top-0 size-5 rounded-full bg-[#0f1113]" />
      </div>
      <div className="flex flex-1 items-center gap-4 px-5 pt-3 pb-5 sm:px-6 lg:landscape:min-h-0 lg:landscape:flex-col lg:landscape:justify-center lg:landscape:gap-[1.6vh] lg:landscape:px-[1.4vw] lg:landscape:pt-[1vh] lg:landscape:pb-[2vh] lg:landscape:text-center">
        <div
          className="w-[clamp(7.5rem,24vw,13rem)] shrink-0 rounded-xl bg-white p-2 ring-1 ring-slate-200 lg:landscape:w-[min(26vh,17rem)] [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: qr }}
        />
        <p className="text-[clamp(0.85rem,2vw,1.2rem)] leading-relaxed text-slate-600 lg:landscape:text-[clamp(0.8rem,1.8vh,1.15rem)]">{t(lang, "dp_scan")}</p>
      </div>
      {blocker && (
        <div className="flex items-center gap-2 border-t border-rose-100 bg-rose-50 px-5 py-2.5 text-[clamp(0.8rem,1.8vw,1.05rem)] leading-normal font-semibold text-rose-700 sm:px-6 lg:landscape:px-[1.4vw] lg:landscape:py-[1.1vh] lg:landscape:text-[clamp(0.8rem,1.8vh,1.05rem)]">
          <span className="size-2 shrink-0 rounded-full bg-rose-500" />
          {errorText(lang, blocker)}
        </div>
      )}
    </div>
  );
}

/** نداء ملء الشاشة: لافتة الطبيب ثمّ الرقم على ألواح عملاقة تنقلب. */
function Callout({ lang, n, title, onClose }: { lang: Lang; n: number; title: string; onClose: () => void }) {
  return (
    <div role="alert" onClick={onClose} className="fixed inset-0 z-50 flex cursor-pointer flex-col bg-[#0f1113] text-white">
      <div className={`flex items-center gap-4 px-5 py-4 sm:px-8 lg:landscape:gap-[1.6vw] lg:landscape:px-[2.5vw] lg:landscape:py-[2vh] ${SIGN}`}>
        <Pictogram className="size-[clamp(3rem,8.5vw,5.75rem)] rounded-[clamp(0.6rem,1.4vw,1rem)] lg:landscape:size-[9vh] lg:landscape:rounded-[1.4vh]" />
        <span className="min-w-0 text-[clamp(1.3rem,4.6vw,3.2rem)] leading-[1.35] font-bold break-words lg:landscape:text-[clamp(1.4rem,5vh,3.4rem)]">{title}</span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-[3vh] bg-[radial-gradient(55%_50%_at_50%_52%,color-mix(in_srgb,var(--color-brand-600)_24%,transparent),transparent_75%)] px-5 text-center">
        <Eyebrow className="text-[clamp(1.3rem,4.4vh,3rem)]">{t(lang, "dp_number")}</Eyebrow>
        <div className="text-[min(44vh,30vw)]">
          <Flaps items={glyphs(n, 3)} face="amber" flipKey={String(n)} />
        </div>
        <p className="flex items-center gap-[0.45em] text-[clamp(1.6rem,min(6.4vh,9vw),4.6rem)] leading-[1.4] font-bold">
          <SignArrow on />
          {t(lang, "dp_enter")}
        </p>
      </div>
    </div>
  );
}

// ————————————————————————— الشاشة —————————————————————————

function Layout({ lang, v, doctor, time, date, qr, callout, dismissCallout, voice, toggleVoice }: LayoutProps) {
  const cur = v.currentNumber;
  // تنقلب الألواح عند تغيّر الرقم، ومرّة أخرى حين يُغلق النداء (كي تُرى الحركة على اللوحة)
  const flipKey = `${callout === null ? "b" : "c"}-${cur ?? "x"}`;
  return (
    <main className="relative flex min-h-dvh flex-col bg-[#0f1113] text-white lg:landscape:h-dvh lg:landscape:overflow-hidden">
      <Header lang={lang} v={v} doctor={doctor} time={time} date={date} />

      <div className="flex flex-1 flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:landscape:grid lg:landscape:min-h-0 lg:landscape:grid-cols-[minmax(0,1fr)_min(22vw,24rem)] lg:landscape:gap-[1.6vw] lg:landscape:px-[2.5vw] lg:landscape:py-[2vh]">
        {/* اللوحة */}
        <section className={`relative flex flex-1 flex-col overflow-hidden rounded-2xl lg:landscape:min-h-0 lg:landscape:rounded-[1.6vh] ${PANEL}`}>
          <NowRow lang={lang} cur={cur} flipKey={flipKey} />
          <NextTable lang={lang} next={v.nextNumbers} avg={v.avgServiceMin} />
        </section>

        <aside className="grid content-start gap-4 sm:gap-6 portrait:sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] portrait:sm:content-stretch lg:landscape:flex lg:landscape:min-h-0 lg:landscape:flex-col lg:landscape:gap-[1.6vh]">
          <Stats lang={lang} waiting={v.waiting} avg={v.avgServiceMin} />
          <Pass lang={lang} qr={qr} blocker={v.blocker} />
        </aside>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-white/[0.06] px-4 py-3 text-[clamp(0.72rem,1.6vw,0.95rem)] leading-normal text-white/50 sm:px-6 lg:landscape:px-[2.5vw] lg:landscape:py-[0.8vh] lg:landscape:text-[clamp(0.72rem,1.55vh,0.95rem)]">
        <span className="flex min-w-0 items-center gap-2">
          <LogoMark size={18} className="shrink-0" />
          {t(lang, "dp_footer")}
        </span>
        <Controls
          lang={lang}
          voice={voice}
          toggleVoice={toggleVoice}
          tone="dark"
          className="opacity-60 transition-opacity focus-within:opacity-100 hover:opacity-100 [&_button]:px-3 [&_button]:py-1 [&_button]:text-xs"
        />
      </footer>

      {callout !== null && <Callout lang={lang} n={callout} title={doctor ?? v.name} onClose={dismissCallout} />}
    </main>
  );
}

// ————————————————————————— المصغّر —————————————————————————

/** مصغّر 16:9: شريط اللافتة، الرقم على ألواح كهرمانية، صفوف القادمين، وبطاقة QR بيضاء. */
function Thumb() {
  const bar = (w: string, c: string) => <span className={`h-[1.6cqw] rounded-full ${w} ${c}`} />;
  return (
    <div aria-hidden className="@container flex aspect-video w-full flex-col overflow-hidden rounded-xl bg-[#0f1113]">
      <div className={`flex h-[17%] shrink-0 items-center gap-[2.2cqw] px-[3cqw] ${SIGN}`}>
        <span className="size-[6.5cqw] rounded-[1.2cqw] bg-white" />
        <span className="flex flex-col gap-[1.2cqw]">
          {bar("w-[24cqw]", "bg-white/90")}
          {bar("w-[14cqw]", "bg-white/45")}
        </span>
        <span className="ms-auto text-[4.4cqw]">
          <Clock time="09:41" />
        </span>
      </div>
      <div className="flex min-h-0 flex-1 gap-[2.4cqw] p-[2.8cqw]">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[1.6cqw] bg-[#15181c] ring-1 ring-white/[0.07]">
          <div className="flex flex-1 items-center gap-[3cqw] bg-[radial-gradient(70%_100%_at_25%_0%,color-mix(in_srgb,var(--color-brand-500)_18%,transparent),transparent_70%)] px-[2.6cqw] rtl:bg-[radial-gradient(70%_100%_at_75%_0%,color-mix(in_srgb,var(--color-brand-500)_18%,transparent),transparent_70%)]">
            <span className="text-[12cqw]">
              <Flaps items={glyphs(42, 3)} face="amber" />
            </span>
            <span className="flex flex-col gap-[1.6cqw]">
              <span className="flex items-center gap-[1cqw]">
                <span className="size-[1.6cqw] rounded-full bg-[#4ade80] shadow-[0_0_1cqw_#4ade80]" />
                {bar("w-[11cqw]", "bg-[#4ade80]/80")}
              </span>
              <span className="flex items-center gap-[1cqw]">
                <span className="size-[3.2cqw] rounded-[0.6cqw] bg-brand-600" />
                {bar("w-[15cqw]", "bg-white/85")}
              </span>
            </span>
          </div>
          {[
            { n: 43, c: "bg-[#ffcc33]" },
            { n: 44, c: "bg-white/85" },
            { n: 45, c: "bg-white/35" },
          ].map((r) => (
            <div key={r.n} className="flex items-center gap-[2.4cqw] border-t border-white/[0.06] px-[2.6cqw] py-[0.9cqw]">
              <span className="text-[4.4cqw]">
                <Flaps items={glyphs(r.n, 3)} face="white" />
              </span>
              <span className="flex items-center gap-[1cqw] rounded-[0.6cqw] bg-black/50 px-[1.2cqw] py-[0.9cqw]">
                <span className={`size-[1.3cqw] rounded-full ${r.c}`} />
                {bar("w-[8cqw]", r.c)}
              </span>
              <span className="ms-auto text-[3.2cqw]">
                <Flaps items={glyphs((r.n - 42) * 12, 2)} face="white" />
              </span>
            </div>
          ))}
        </div>
        <div className="flex w-[25%] shrink-0 flex-col gap-[2.4cqw]">
          <div className="flex items-center justify-center rounded-[1.6cqw] bg-[#15181c] py-[2cqw] text-[4.6cqw] ring-1 ring-white/[0.07]">
            <Flaps items={glyphs(7, 2)} face="white" />
          </div>
          <div className="relative flex flex-1 flex-col items-center justify-center gap-[1.6cqw] rounded-[1.6cqw] bg-white p-[2cqw]">
            {bar("w-[14cqw]", "bg-brand-700")}
            <span className="w-full border-t border-dashed border-slate-300" />
            <svg viewBox="0 0 21 21" className="w-[13cqw] text-ink" shapeRendering="crispEdges">
              {[
                [0, 0],
                [14, 0],
                [0, 14],
              ].map(([x, y]) => (
                <g key={`${x}-${y}`} fill="currentColor">
                  <path d={`M${x} ${y}h7v7h-7z M${x + 1} ${y + 1}v5h5v-5z`} fillRule="evenodd" />
                  <rect x={x + 2} y={y + 2} width="3" height="3" />
                </g>
              ))}
              <path
                fill="currentColor"
                d="M9 1h2v2H9zM8 4h3v2H8zM9 8h4v2H9zM1 9h3v2H1zM5 9h2v3H5zM15 9h4v2h-4zM12 12h3v2h-3zM17 12h3v3h-3zM9 13h2v4H9zM12 16h2v4h-2zM15 17h5v2h-5zM8 19h3v2H8z"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

export const board: LayoutDef = { Layout, Thumb };
