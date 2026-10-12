"use client";
import type { ReactNode } from "react";
import { ArrowRight, Clock3, Stethoscope, Users } from "lucide-react";
import SoundGate from "@/components/SoundGate";
import { LogoMark } from "@/components/ui";
import type { Lang } from "@/lib/domain/types";
import { errorText, t } from "@/lib/i18n";
import type { PublicShopView } from "@/lib/server/service";
import { Controls } from "./shared";
import type { LayoutDef, LayoutProps } from "./types";

/**
 * «رقمي LED»: لوحة عدّاد كالتي في البنوك والمستشفيات — لوح أسود مطفأ بملمس نقطي دقيق،
 * نوافذ زجاج داكن في إطارات معدنية، وأرقام بسبع قطع مضيئة بلون العيادة (والقطع المطفأة تبقى خافتة كالجهاز الحقيقي).
 * كلّ المقاسات بوحدة em واحدة (UNIT) فتتناسب الشاشة كلّها من الهاتف إلى التلفاز.
 */

// وحدة القياس: 20px على تلفاز 1080p، تصغر بالتناسب (حتى تلفاز 960×540)، و14px على الأقلّ بالطول/الهاتف
const UNIT = "text-[clamp(9px,min(1.85vh,1.04vw),44px)] portrait:text-[clamp(14px,min(1.15vh,2.1vw),44px)]";
const GUTTER = "px-[2.4em] portrait:px-[min(1.6em,5vw)]";
// اللوح: أسود مطفأ مع ضوء علوي خفيف
const PANEL = "bg-[linear-gradient(180deg,#141518,#0b0c0e_42%,#070809)]";
// تسمية محفورة: اللاتينية بحروف كبيرة متباعدة، والعربية بلا تباعد (يكسر وصل الحروف)
const ETCH = "font-semibold leading-normal ltr:uppercase ltr:tracking-[0.14em] [text-shadow:0_1px_0_#000]";

/* ———————————— الأرقام بسبع قطع (SVG) ———————————— */

// هندسة الخانة بوحدات viewBox: ارتفاع H، عرض W، سماكة القطعة T، فراغ الوصلات G، ميلان SL
const H = 100;
const W = 54;
const T = 12;
const G = 1.8;
const SL = 0.1;
const GAP = 18; // بين الخانات
const COLON = 30; // عرض النقطتين «:»
const PAD = 8; // هامش للتوهّج
const PITCH = W + GAP;
const h2 = T / 2;

type Pt = readonly [number, number];
// الميلان: كلّ نقطة تنزاح يميناً بقدر ارتفاعها (خطّ مائل كشاشات العدّادات)
const poly = (pts: Pt[]) => pts.map(([x, y]) => `${+(x + SL * (H - y)).toFixed(2)},${y}`).join(" ");
const hSeg = (y: number) =>
  poly([[T / 2 + G, y], [T + G, y - h2], [W - T - G, y - h2], [W - h2 - G, y], [W - T - G, y + h2], [T + G, y + h2]]);
const vSeg = (x: number, y0: number, y1: number) =>
  poly([[x, y0 + G], [x + h2, y0 + G + h2], [x + h2, y1 - G - h2], [x, y1 - G], [x - h2, y1 - G - h2], [x - h2, y0 + G + h2]]);
const dot = (cx: number, cy: number) => {
  const s = T * 0.46;
  return poly([[cx - s, cy - s], [cx + s, cy - s], [cx + s, cy + s], [cx - s, cy + s]]);
};

// القطع بالترتيب a b c d e f g (أعلى، أعلى يمين، أسفل يمين، أسفل، أسفل يسار، أعلى يسار، وسط)
const SEGS = [
  hSeg(h2),
  vSeg(W - h2, h2, H / 2),
  vSeg(W - h2, H / 2, H - h2),
  hSeg(H - h2),
  vSeg(h2, H / 2, H - h2),
  vSeg(h2, h2, H / 2),
  hSeg(H / 2),
];
const COLON_DOTS = [dot((COLON - GAP) / 2, 32), dot((COLON - GAP) / 2, 68)];
const GLYPHS: Record<string, string> = {
  "0": "1111110",
  "1": "0110000",
  "2": "1101101",
  "3": "1111001",
  "4": "0110011",
  "5": "1011011",
  "6": "1011111",
  "7": "1110000",
  "8": "1111111",
  "9": "1111011",
  "-": "0000001",
};

// طبقات التوهّج [العرض، الشفافية]: من الأعرض الأخفت إلى الأضيق الأقوى (تقريب لتوهّج ضبابي)؛
// الشاشات الصغيرة تكفيها طبقتان (عُقد أقلّ على أجهزة التلفاز الضعيفة)
const HALO = {
  full: [
    [20, 0.03],
    [13, 0.05],
    [8, 0.08],
    [4, 0.12],
  ],
  soft: [
    [12, 0.06],
    [5, 0.14],
  ],
} as const;

type Shape = { key: string; at: number; pts: string };

/** شاشة سبع قطع: «  7» تُظهر خانتين مطفأتين (8 خافتة) ثمّ 7 مضيئة؛ «:» نقطتان تومضان. */
function SevenSeg({
  text,
  className = "",
  litClass = "",
  halo = "soft",
}: {
  text: string;
  className?: string;
  litClass?: string;
  halo?: keyof typeof HALO;
}) {
  const ghost: Shape[] = [];
  const lit: Shape[] = [];
  const dots: Shape[] = [];
  let x = PAD;
  [...text].forEach((ch, ci) => {
    const at = x;
    if (ch === ":") {
      COLON_DOTS.forEach((pts, i) => {
        ghost.push({ key: `${ci}c${i}`, at, pts });
        dots.push({ key: `${ci}c${i}`, at, pts });
      });
      x += COLON;
      return;
    }
    const on = GLYPHS[ch] ?? "";
    SEGS.forEach((pts, i) => (on[i] === "1" ? lit : ghost).push({ key: `${ci}s${i}`, at, pts }));
    x += PITCH;
  });
  const width = x - GAP + SL * H + PAD;
  const draw = (list: Shape[]) =>
    list.map((s) => <polygon key={s.key} points={s.pts} transform={`translate(${s.at} ${PAD})`} />);
  // التوهّج دون فلاتر (أخفّ على أجهزة التلفاز): حدود متدرّجة خلف القطعة المضيئة؛
  // الشفافية على المجموعة لا على كلّ قطعة كي لا تتراكم عند الوصلات
  const glow = (list: Shape[]) => (
    <>
      {HALO[halo].map(([w, o]) => (
        <g key={w} fill="none" className="stroke-brand-400" opacity={o} strokeWidth={w} strokeLinejoin="round">
          {draw(list)}
        </g>
      ))}
      <g className="fill-brand-300">{draw(list)}</g>
    </>
  );
  return (
    <svg viewBox={`0 0 ${width} ${H + 2 * PAD}`} className={className} aria-hidden="true" focusable="false">
      <g className="fill-brand-300" fillOpacity={0.075}>
        {draw(ghost)}
      </g>
      <g className={litClass}>{glow(lit)}</g>
      {dots.length > 0 && <g className="motion-safe:animate-[dw-led-colon_1s_linear_infinite]">{glow(dots)}</g>}
    </svg>
  );
}

/** خانات ثابتة كجهاز حقيقي: ما لا يُستعمل يبقى «8» خافتة، وبلا رقم: «---». */
const cells = (n: number | null, width = 3) => (n === null ? "-".repeat(width) : String(n).padStart(width, " "));

function clockText(time: string) {
  const m = /^(\d{1,2})\D+(\d{2})/.exec(time);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "  :  ";
}

/* ———————————— عتاد اللوح ———————————— */

/** برغي صغير برأس مشقوق. */
function Screw({ className, turn = "rotate-45" }: { className: string; turn?: string }) {
  return (
    <span
      aria-hidden
      className={`absolute rounded-full bg-[radial-gradient(circle_at_35%_30%,#a7aaaf,#5a5d62_55%,#26272a)] shadow-[0_1px_1.5px_rgba(0,0,0,0.85)] ${className}`}
    >
      <span className={`absolute inset-x-[18%] top-1/2 h-[14%] -translate-y-1/2 rounded-full bg-black/60 ${turn}`} />
    </span>
  );
}

// مصابيح المؤشّر (أصناف كاملة كي يلتقطها Tailwind): حلقة إطار داكنة + لمعة + توهّج ثابت
const LAMPS = {
  on: "bg-[radial-gradient(circle_at_38%_32%,#fff,var(--color-brand-200)_22%,var(--color-brand-400)_58%,var(--color-brand-700))] shadow-[0_0_0_0.14em_#050506,0_0_0_0.24em_rgba(255,255,255,0.09),0_0_1em_0.12em_var(--color-brand-500)]",
  warn: "bg-[radial-gradient(circle_at_38%_32%,#fff,#fde68a_22%,#fbbf24_58%,#b45309)] shadow-[0_0_0_0.14em_#050506,0_0_0_0.24em_rgba(255,255,255,0.09),0_0_1em_0.12em_#f59e0b]",
  off: "bg-[radial-gradient(circle_at_38%_32%,#45484d,#1a1b1e_70%)] shadow-[0_0_0_0.14em_#050506,0_0_0_0.24em_rgba(255,255,255,0.09)]",
} as const;

/** مصباح مؤشّر بإطار: مضيء بلون العيادة، أو كهرماني (تنبيه)، أو مطفأ. */
function Lamp({ state, className }: { state: keyof typeof LAMPS; className: string }) {
  return <span aria-hidden className={`inline-block shrink-0 rounded-full ${LAMPS[state]} ${className}`} />;
}

/** لوحة تسمية معدنية صغيرة فوق كلّ نافذة. */
function Plate({ children, className = "text-[0.95em]" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-[0.55em] rounded-[0.4em] bg-[linear-gradient(180deg,#2a2c31,#191a1d)] px-[0.85em] py-[0.12em] text-white/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_0_rgba(255,255,255,0.03)] ring-1 ring-black ${ETCH} ${className}`}
    >
      {children}
    </span>
  );
}

/** إطار معدني + نافذة زجاج داكن بانعكاس قطري خفيف. */
function Module({ children, className = "", inner = "" }: { children: ReactNode; className?: string; inner?: string }) {
  return (
    <div
      className={`flex flex-col rounded-[1em] bg-[linear-gradient(180deg,#2b2d32,#17181b_45%,#0f1012)] p-[0.4em] shadow-[0_1.2em_2.4em_-1em_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.6)] ring-1 ring-black ${className}`}
    >
      <div
        className={`relative min-h-0 flex-1 overflow-hidden rounded-[0.7em] bg-[#030304] shadow-[inset_0_0.3em_0.9em_rgba(0,0,0,0.95),inset_0_0_0_1px_rgba(255,255,255,0.035)] ${inner}`}
      >
        {children}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.05),rgba(255,255,255,0.012)_34%,transparent_35%)]"
        />
      </div>
    </div>
  );
}

/** ملمس اللوح (نقاط دقيقة) + انعكاس ضوء الأرقام + أربعة براغٍ في الزوايا. */
function PanelDecor() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.045)_0.8px,transparent_1.1px)] [background-size:6px_6px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_52%,color-mix(in_srgb,var(--color-brand-500)_7%,transparent),transparent_75%)]"
      />
      <Screw className="start-[0.75em] top-[0.75em] size-[0.62em]" />
      <Screw className="end-[0.75em] top-[0.75em] size-[0.62em]" turn="-rotate-12" />
      <Screw className="start-[0.75em] bottom-[0.75em] size-[0.62em]" turn="rotate-[70deg]" />
      <Screw className="end-[0.75em] bottom-[0.75em] size-[0.62em]" turn="rotate-[20deg]" />
    </>
  );
}

/* ———————————— أقسام الشاشة ———————————— */

/** العنوان يصغر قليلاً مع الأسماء الطويلة كي يبقى سطراً واحداً على التلفاز (ويُسمح بسطرين). */
function titleSize(s: string) {
  return s.length > 34
    ? "text-[1.85em] max-sm:text-[1.6em]"
    : s.length > 24
      ? "text-[2.2em] max-sm:text-[1.8em]"
      : "text-[2.6em] max-sm:text-[2em]";
}

/** الأعلى: الطبيب والتخصّص (أو اسم العيادة) — زرّ الصوت في الوسط — التاريخ والساعة الرقمية. */
function Header({ lang, v, doctor, time, date }: Pick<LayoutProps, "lang" | "v" | "doctor" | "time" | "date">) {
  const spec = v.profile.specialty?.trim();
  // بلا اسم طبيب: اسم العيادة يأخذ مكانه فلا يبقى فراغ
  const title = doctor ?? v.name;
  return (
    <header
      className={`relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-[2em] gap-y-[0.9em] border-b border-black pt-[1.3em] pb-[1em] shadow-[0_1px_0_rgba(255,255,255,0.05)] max-sm:grid-cols-1 landscape:grid-cols-[minmax(0,1fr)_auto_auto] ${GUTTER}`}
    >
      <div className="min-w-0">
        <h1 className={`leading-normal font-bold text-balance ${titleSize(title)}`}>{title}</h1>
        {(spec || doctor) && (
          <p className="flex flex-wrap items-center gap-x-[0.7em] text-[1.15em] leading-normal">
            {spec && <span className="font-semibold text-brand-300">{spec}</span>}
            {spec && doctor && <span aria-hidden className="size-[0.3em] rounded-full bg-white/30" />}
            {doctor && <span className="text-white/65">{v.name}</span>}
          </p>
        )}
      </div>

      <div className="flex items-center gap-[1em] justify-self-end max-sm:justify-self-start portrait:sm:flex-col-reverse portrait:sm:items-end portrait:sm:gap-[0.4em] landscape:col-start-3 landscape:row-start-1">
        {date && <span className="max-w-[10em] text-end text-[1em] leading-normal text-white/60 max-sm:order-last max-sm:text-start">{date}</span>}
        <Module inner="px-[0.85em] py-[0.55em]">
          <SevenSeg text={clockText(time)} className="block h-[2.6em] w-auto" />
          <span className="sr-only">{time}</span>
        </Module>
      </div>

      {/* يظهر فقط ما دام الصوت مقفلاً؛ بالعرض يجلس قبل الساعة فلا يدفع الشاشة إلى الأسفل */}
      <div className="col-span-full empty:hidden landscape:col-span-1 landscape:col-start-2 landscape:row-start-1 landscape:w-[min(26rem,28vw)]">
        <SoundGate lang={lang} tone="dark" />
      </div>
    </header>
  );
}

/** العدّاد الرئيسي: ثلاث خانات ضخمة + مصباح «تفضّل بالدخول». */
function Counter({ lang, v }: { lang: Lang; v: PublicShopView }) {
  const n = v.currentNumber;
  return (
    <section className="flex min-h-0 flex-col gap-[0.6em]">
      <div className="flex flex-wrap items-center justify-between gap-x-[1.2em] gap-y-[0.4em]">
        <Plate className="text-[1.1em]">{t(lang, "displayNow")}</Plate>
        {v.blocker && (
          <span className="flex items-center gap-[0.6em] text-[0.95em] leading-normal text-white/70">
            <Lamp state="warn" className="size-[0.7em]" />
            {errorText(lang, v.blocker)}
          </span>
        )}
      </div>
      <Module
        className="flex-1"
        inner="flex flex-col items-center justify-center gap-[1.1em] px-[1.6em] py-[1.4em] max-sm:px-[1em]"
      >
        <div data-testid="display-number" className="flex w-full justify-center">
          <SevenSeg text={cells(n)} halo="full" className="block h-auto w-full max-w-[46em] landscape:w-[min(46em,100%)]" />
          <span className="sr-only">{n ?? "—"}</span>
        </div>
        {/* المصباح والسهم داخل السطر: إن التفّ النصّ (الفرنسية بالطول) بقيا ملتصقين به */}
        <p
          className={`text-center text-[2.2em] leading-normal font-bold text-balance max-sm:text-[1.5em] ${n !== null ? "text-white" : "text-white/70"}`}
        >
          <Lamp state={n !== null ? "on" : "off"} className="me-[0.7em] size-[1.4em] align-middle text-[0.45em]" />
          {n !== null ? t(lang, "dp_enter") : t(lang, "dp_soon")}
          {n !== null && (
            <ArrowRight aria-hidden strokeWidth={2.5} className="ms-[0.3em] inline-block size-[1em] align-middle text-brand-300 rtl:-scale-x-100" />
          )}
        </p>
      </Module>
    </section>
  );
}

/** الأرقام القادمة: التالي كبيراً، ثمّ خانتان أصغر (تبقى مطفأة إن لم يوجد رقم). */
function Upcoming({ lang, v }: { lang: Lang; v: PublicShopView }) {
  const [first, ...rest] = v.nextNumbers;
  const empty = first === undefined;
  return (
    <section className="flex min-h-0 flex-col gap-[0.5em] landscape:flex-1 portrait:sm:row-span-2">
      <Plate>{t(lang, "dp_upcoming")}</Plate>
      <Module className="flex-1" inner="flex flex-col justify-center gap-[1em] p-[1.1em]">
        <div className="flex items-center justify-between gap-[1em]">
          <span className={`flex min-w-0 items-center gap-[0.6em] text-[1.15em] leading-normal font-semibold ${empty ? "text-white/55" : "text-white/85"}`}>
            <Lamp state={empty ? "off" : "on"} className="size-[0.7em]" />
            {empty ? t(lang, "emptyQueue") : t(lang, "db_upNext")}
          </span>
          <SevenSeg text={empty ? "   " : cells(first)} className="block h-[4.6em] w-auto shrink-0" />
        </div>
        <div className="grid grid-cols-2 gap-[0.8em] border-t border-white/[0.07] pt-[1em]">
          {[rest[0], rest[1]].map((n, i) => (
            <div key={i} className="flex justify-center">
              <SevenSeg text={n === undefined ? "   " : cells(n)} className="block h-[3em] w-auto" />
            </div>
          ))}
        </div>
        <span className="sr-only">{v.nextNumbers.join(lang === "ar" ? "، " : ", ")}</span>
      </Module>
    </section>
  );
}

/** عدد المنتظرين ومدّة الكشف على شاشتين صغيرتين. */
function Stats({ lang, v }: { lang: Lang; v: PublicShopView }) {
  const unit = t(lang, "dp_min", { n: "" }).trim();
  const label = "flex items-center gap-[0.45em] text-[0.95em] font-medium leading-normal text-white/60";
  return (
    // بالطول (عمودان): ينزل بقدر لوحة «الأرقام القادمة» كي تتحاذى الإطارات
    <Module className="portrait:sm:mt-[2.15em]" inner="grid grid-cols-2">
      <div className="flex flex-col justify-center gap-[0.35em] px-[1.1em] py-[0.9em]">
        <span className={label}>
          <Users aria-hidden className="size-[1.1em] shrink-0" /> {t(lang, "waitingCount")}
        </span>
        <SevenSeg text={cells(v.waiting, 2)} className="block h-[2.8em] w-auto self-start" />
        <span className="sr-only">{v.waiting}</span>
      </div>
      <div className="flex flex-col justify-center gap-[0.35em] border-s border-white/[0.07] px-[1.1em] py-[0.9em]">
        <span className={label}>
          <Clock3 aria-hidden className="size-[1.1em] shrink-0" /> {t(lang, "dp_avg")}
        </span>
        <span className="flex items-end gap-[0.4em]">
          <SevenSeg text={cells(v.avgServiceMin, 2)} className="block h-[2.8em] w-auto" />
          <span className="pb-[0.1em] text-[1.05em] leading-normal font-semibold text-white/60">{unit}</span>
          <span className="sr-only">{v.avgServiceMin}</span>
        </span>
      </div>
    </Module>
  );
}

/** لوحة بيضاء مثبّتة ببراغٍ: رمز QR + الدعوة لأخذ رقم من الهاتف. */
function QrPlate({ lang, qr }: { lang: Lang; qr: string }) {
  return (
    <div className="relative flex items-center gap-[1.1em] rounded-[0.7em] bg-[linear-gradient(180deg,#fbfbfa,#ebecea)] p-[1em] text-ink shadow-[0_1em_2em_-1em_rgba(0,0,0,0.95),inset_0_-1px_0_rgba(0,0,0,0.12)] ring-1 ring-black/70">
      <Screw className="start-[0.4em] top-[0.4em] size-[0.48em]" />
      <Screw className="end-[0.4em] top-[0.4em] size-[0.48em]" turn="rotate-[100deg]" />
      <Screw className="start-[0.4em] bottom-[0.4em] size-[0.48em]" turn="-rotate-[30deg]" />
      <Screw className="end-[0.4em] bottom-[0.4em] size-[0.48em]" turn="rotate-[10deg]" />
      <div
        className="w-[7.8em] shrink-0 rounded-[0.4em] bg-white p-[0.35em] ring-1 ring-slate-200 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: qr }}
      />
      <div className="min-w-0">
        <div className="text-[1.12em] leading-snug font-bold text-balance">{t(lang, "posterTitle")}</div>
        <p className="mt-[0.35em] text-[0.88em] leading-normal text-slate-600">{t(lang, "dp_scan")}</p>
      </div>
    </div>
  );
}

/** شريط متحرّك بنقاط LED: العيادة • الطبيب • التخصّص • الدعوة لمسح الرمز. */
function Ticker({ lang, v, doctor }: { lang: Lang; v: PublicShopView; doctor: string | null }) {
  const items = [
    ...new Set([v.name, doctor, v.profile.specialty?.trim(), t(lang, "posterTitle"), t(lang, "dp_scan")].filter((s): s is string => !!s)),
  ];
  const secs = Math.max(32, Math.round(items.join("").length * 0.32));
  // بالعربية يسير الشريط نحو اليمين (بداية النصّ تظهر أوّلاً)
  const run =
    lang === "ar"
      ? "motion-safe:animate-[dw-led-marquee-rtl_40s_linear_infinite]"
      : "motion-safe:animate-[dw-led-marquee_40s_linear_infinite]";
  const copy = (hidden: boolean) => (
    <div aria-hidden={hidden || undefined} className="flex min-w-[100vw] shrink-0 items-center justify-around gap-[2.2em] pe-[2.2em]">
      {items.map((s, i) => (
        <span key={i} className="flex items-center gap-[2.2em] whitespace-nowrap">
          <span aria-hidden className="size-[0.4em] shrink-0 rotate-45 bg-brand-400" />
          {s}
        </span>
      ))}
    </div>
  );
  return (
    <div className={`relative ${GUTTER}`}>
      <Module inner="flex h-[3.2em] items-center bg-[radial-gradient(circle,rgba(255,255,255,0.07)_1.1px,transparent_1.6px)] [background-size:4px_4px]">
        <div className={`flex w-max text-[1.6em] leading-normal font-bold text-brand-200 ${run}`} style={{ animationDuration: `${secs}s` }}>
          {copy(false)}
          {copy(true)}
        </div>
        {/* شبكة البكسلات فوق النصّ: تجعله نقاطاً مضيئة كلافتة LED */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,transparent_1.2px,rgba(3,3,4,0.8)_1.8px)] [background-size:4px_4px]"
        />
      </Module>
    </div>
  );
}

/** النداء: الشاشة كلّها عدّاد واحد، والرقم يومض ثلاث مرّات ثمّ يثبت. */
function Callout({ lang, n, doctor, onClose }: { lang: Lang; n: number; doctor: string | null; onClose: () => void }) {
  return (
    <div role="alert" onClick={onClose} className={`fixed inset-0 z-50 flex cursor-pointer p-[2.6vmin] text-white ${PANEL}`}>
      <PanelDecor />
      <Module
        className="relative min-w-0 flex-1"
        inner="flex flex-col items-center justify-center gap-[2.6vmin] px-[4vmin] py-[3vmin] text-center"
      >
        <Plate className="text-[clamp(1.1rem,3.4vmin,2.6rem)]">{t(lang, "dp_number")}</Plate>
        <SevenSeg
          text={cells(n)}
          halo="full"
          className="block h-auto w-[min(82vw,112vh)] max-w-full portrait:w-[min(80vw,58vh)]"
          litClass="motion-safe:animate-[dw-led-blink3_2.1s_linear_both]"
        />
        <span className="sr-only">{n}</span>
        <div className="flex flex-wrap items-center justify-center gap-x-[5vmin] gap-y-[1.5vmin]">
          <span className="flex items-center gap-[2vmin]">
            <Lamp state="on" className="size-[3.2vmin]" />
            <span className="text-[clamp(1.8rem,7vmin,5.5rem)] leading-normal font-bold">{t(lang, "dp_enter")}</span>
            <ArrowRight aria-hidden strokeWidth={2.5} className="size-[6.5vmin] shrink-0 text-brand-300 rtl:-scale-x-100" />
          </span>
          {doctor && (
            <span className="flex items-center gap-[1.4vmin] text-[clamp(1.1rem,3.8vmin,2.8rem)] leading-normal font-semibold text-white/80 landscape:border-s landscape:border-white/10 landscape:ps-[5vmin]">
              <Stethoscope aria-hidden className="size-[1.1em] shrink-0 text-brand-300" />
              {doctor}
            </span>
          )}
        </div>
      </Module>
    </div>
  );
}

/* ———————————— الشاشة ———————————— */

function LedLayout({ lang, v, doctor, time, date, qr, callout, dismissCallout, voice, toggleVoice }: LayoutProps) {
  return (
    <main className={`relative flex min-h-dvh flex-col overflow-hidden text-white ${PANEL} ${UNIT}`}>
      <PanelDecor />
      <Header lang={lang} v={v} doctor={doctor} time={time} date={date} />

      <div
        className={`relative grid flex-1 gap-[1.4em] py-[1.2em] landscape:grid-cols-[minmax(0,1fr)_25em] portrait:max-sm:grid-rows-[1fr_auto] portrait:sm:grid-rows-[1.7fr_1fr] ${GUTTER}`}
      >
        <Counter lang={lang} v={v} />
        <aside className="flex min-h-0 flex-col gap-[1.1em] portrait:sm:grid portrait:sm:grid-cols-2 portrait:sm:grid-rows-[1fr_auto]">
          <Upcoming lang={lang} v={v} />
          <Stats lang={lang} v={v} />
          <QrPlate lang={lang} qr={qr} />
        </aside>
      </div>

      <Ticker lang={lang} v={v} doctor={doctor} />

      <footer className={`relative flex flex-wrap items-center justify-between gap-x-[1.5em] gap-y-[0.6em] pt-[0.8em] pb-[1em] ${GUTTER}`}>
        <span className="flex items-center gap-[0.6em] text-[0.82em] leading-normal text-white/45">
          <LogoMark size={18} className="shrink-0" />
          {t(lang, "dp_footer")}
        </span>
        <Controls lang={lang} voice={voice} toggleVoice={toggleVoice} tone="dark" className="text-white/70" />
      </footer>

      {callout !== null && <Callout lang={lang} n={callout} doctor={doctor} onClose={dismissCallout} />}
    </main>
  );
}

/* ———————————— المصغّر ———————————— */

function LedThumb() {
  const win =
    "flex items-center justify-center overflow-hidden rounded-[5px] bg-[#030304] shadow-[0_0_0_2px_#222428,0_0_0_3px_#000,inset_0_1px_3px_rgba(0,0,0,0.9)]";
  return (
    <div
      aria-hidden
      className="relative aspect-video w-full overflow-hidden rounded-xl bg-[linear-gradient(180deg,#17181b,#0a0b0d_55%,#060708)] p-[5.5%]"
    >
      <span className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.07)_0.6px,transparent_0.9px)] [background-size:4px_4px]" />
      {["start-1 top-1", "end-1 top-1", "start-1 bottom-1", "end-1 bottom-1"].map((c) => (
        <span key={c} className={`absolute size-1 rounded-full bg-[#74777c] ${c}`} />
      ))}
      <div className="relative flex h-full flex-col gap-[7px]">
        <div className="flex min-h-0 flex-1 gap-[7px]">
          <div className={`${win} flex-[1.7] flex-col gap-[6%]`}>
            <SevenSeg text=" 42" className="block h-auto w-[76%]" />
            <span className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-brand-300 shadow-[0_0_4px_var(--color-brand-400)]" />
              <span className="h-1 w-8 rounded-full bg-white/30" />
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
            <div className={`${win} flex-1`}>
              <SevenSeg text=" 43" className="block h-auto w-[70%]" />
            </div>
            <div className="flex min-h-0 flex-1 items-center gap-1.5 rounded-[4px] bg-[#f3f3f1] p-1">
              <svg viewBox="0 0 7 7" className="h-full w-auto shrink-0" shapeRendering="crispEdges">
                <path d="M0 0h3v3H0zM4 0h3v3H4zM0 4h3v3H0zM4 4h1v1H4zM5 5h1v1H5zM6 4h1v3H6zM4 6h1v1H4z" fill="#0b1b2b" />
              </svg>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="h-1 rounded-full bg-slate-400" />
                <span className="h-1 w-2/3 rounded-full bg-slate-300" />
              </span>
            </div>
          </div>
        </div>
        <div className={`${win} h-[15%] shrink-0 justify-start gap-2 px-2`}>
          {["w-[22%]", "w-[30%]", "w-[18%]"].map((w) => (
            <span
              key={w}
              className={`h-[55%] shrink-0 bg-[radial-gradient(circle,var(--color-brand-300)_0.7px,transparent_1px)] [background-size:2.5px_2.5px] ${w}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export const led: LayoutDef = { Layout: LedLayout, Thumb: LedThumb };
