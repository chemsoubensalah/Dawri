"use client";
import { useId, type ReactNode } from "react";
import { Clock3, Heart, Info, Smile, Sparkles, Star, Stethoscope, Users } from "lucide-react";
import SoundGate from "@/components/SoundGate";
import { LogoMark } from "@/components/ui";
import type { Lang } from "@/lib/domain/types";
import { errorText, t, type DictKey } from "@/lib/i18n";
import { Controls } from "./shared";
import type { LayoutDef, LayoutProps } from "./types";

/**
 * «أطفال»: سماء ناعمة بلون العيادة، غيوم وشمس مبتسمة وتلال في الأسفل،
 * والرقم الحالي داخل منطاد كبير يطفو بهدوء. مناسب لطبّ الأطفال والأسنان.
 */

// ألوان ودودة ثابتة بجانب لون العيادة (النصّ فوقها دائماً داكن)
const SUN = "#ffd166";
const CORAL = "#ff8fa3";
const MINT = "#7bdcb5";
const LILAC = "#b8a1ff";

const k = (lang: Lang, key: string) => t(lang, `lay_kids_${key}` as DictKey);

// ————————————————————————— المنطاد —————————————————————————

/**
 * منطاد SVG بجسم بلون العيادة الداكن (600→800) ورقم أبيض.
 * حجم الرقم بوحدات الحاوية (cqw) فيتناسب مع عرض المنطاد مهما كان.
 */
function Balloon({
  n,
  className = "",
  testId,
  float = false,
}: {
  n: number | null;
  className?: string;
  testId?: string;
  float?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const text = n === null ? "" : String(n);
  // رقم واحد يملأ المنطاد، ويصغر مع عدد الخانات ليبقى «88» و«123» داخل الجسم
  const size = text.length >= 3 ? "text-[44cqw]" : text.length === 2 ? "text-[58cqw]" : "text-[70cqw]";
  return (
    <div
      className={`@container relative aspect-[200/270] shrink-0 ${float ? "motion-safe:animate-[dw-kids-float_7s_ease-in-out_infinite]" : ""} ${className}`}
    >
      <svg viewBox="0 0 200 270" className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={`${id}b`} x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0" style={{ stopColor: "var(--color-brand-600)" }} />
            <stop offset="1" style={{ stopColor: "var(--color-brand-800)" }} />
          </linearGradient>
        </defs>
        {/* ظلّ ناعم على الأرض */}
        <ellipse cx="100" cy="268" rx="34" ry="4" fill="rgb(11 27 43 / 0.08)" />
        {/* الحبال */}
        <path d="M62 178 L86 236 M138 178 L114 236" stroke="#9a6a3a" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        {/* السلّة */}
        <rect x="80" y="234" width="40" height="28" rx="7" fill="#f4a261" />
        <rect x="80" y="234" width="40" height="8" rx="4" fill="#d9823f" />
        <path d="M93 244 V260 M107 244 V260" stroke="#d9823f" strokeWidth="2" strokeLinecap="round" />
        {/* الجسم */}
        <path
          d="M100 4C46 4 8 42 8 96c0 50 38 86 74 102l6 12h24l6-12c36-16 74-52 74-102C192 42 154 4 100 4Z"
          fill={`url(#${id}b)`}
        />
        {/* خطوط المنطاد */}
        <path d="M100 4C66 34 58 150 88 210M100 4c34 30 42 146 12 206" stroke="#fff" strokeOpacity="0.14" strokeWidth="3" fill="none" />
        {/* لمعة */}
        <ellipse cx="54" cy="58" rx="16" ry="30" transform="rotate(28 54 58)" fill="#fff" fillOpacity="0.2" />
        <circle cx="72" cy="28" r="5" fill="#fff" fillOpacity="0.25" />
      </svg>
      <div className="absolute inset-x-0 top-0 flex h-[74%] items-center justify-center pt-[4%]">
        {n === null ? (
          // لا رقم بعد: وجه مبتسم ودود بدل شرطة تبدو كعلامة «ممنوع»
          <span key="empty" data-testid={testId} className="animate-pop text-white/90 drop-shadow-[0_0.3cqw_0_rgb(0_0_0/0.22)]">
            <Smile className="size-[38cqw]" strokeWidth={2.2} aria-hidden />
          </span>
        ) : (
          <span
            key={text}
            data-testid={testId}
            className={`num animate-pop leading-none font-bold tracking-tight text-white drop-shadow-[0_0.06em_0_rgb(0_0_0/0.22)] ${size}`}
            dir="ltr"
          >
            {text}
          </span>
        )}
      </div>
    </div>
  );
}

// ————————————————————————— الزخارف —————————————————————————

function Cloud({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 60" className={`pointer-events-none absolute ${className}`} aria-hidden>
      <path d="M22 56a20 20 0 0 1-2-40 26 26 0 0 1 48-8 22 22 0 0 1 34 14 17 17 0 0 1-2 34Z" fill="#fff" />
    </svg>
  );
}

function Sun({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={`pointer-events-none absolute ${className}`} aria-hidden>
      <g stroke={SUN} strokeWidth="7" strokeLinecap="round">
        {Array.from({ length: 10 }, (_, i) => (
          <line key={i} x1="60" y1="8" x2="60" y2="18" transform={`rotate(${i * 36} 60 60)`} />
        ))}
      </g>
      <circle cx="60" cy="60" r="32" fill={SUN} />
      <circle cx="49" cy="55" r="3.5" fill="#7a4b00" />
      <circle cx="71" cy="55" r="3.5" fill="#7a4b00" />
      <path d="M48 67q12 10 24 0" stroke="#7a4b00" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <circle cx="42" cy="66" r="4" fill={CORAL} fillOpacity="0.6" />
      <circle cx="78" cy="66" r="4" fill={CORAL} fillOpacity="0.6" />
    </svg>
  );
}

function Twinkle({ className = "", color }: { className?: string; color: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`pointer-events-none absolute ${className}`} aria-hidden>
      <path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12C7 11 11 7 12 0Z" fill={color} />
    </svg>
  );
}

/** التلال في الأسفل (ممدودة على العرض) */
function Hills({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1200 200" preserveAspectRatio="none" className={`pointer-events-none absolute inset-x-0 bottom-0 w-full ${className}`} aria-hidden>
      <path d="M0 90C180 30 360 40 520 90s340 60 480 0 160-40 200-30V200H0Z" style={{ fill: "var(--color-brand-200)" }} />
      <path d="M0 130c160-50 300-50 460-10s320 40 460-10 230-40 280-20V200H0Z" fill={MINT} fillOpacity="0.55" />
      <path d="M0 160c200-40 380-30 600 0s420 20 600-10V200H0Z" style={{ fill: "var(--color-brand-100)" }} />
    </svg>
  );
}

/** الخلفية: سماء + غيوم + شمس + نجوم + تلال (ثابتة، بلا حركة) */
function Sky({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden bg-[linear-gradient(180deg,var(--color-brand-100),#fff_62%)] ${className}`}>
      <Cloud className="start-[4%] top-[30%] w-[min(16vw,22vh)] opacity-90" />
      <Cloud className="start-[44%] top-[10%] w-[min(11vw,15vh)] opacity-80" />
      <Cloud className="end-[6%] top-[44%] w-[min(13vw,18vh)] opacity-70" />
      <Twinkle color={LILAC} className="start-[34%] top-[24%] size-[min(3vw,4vh)]" />
      <Twinkle color={CORAL} className="end-[38%] top-[16%] size-[min(2vw,3vh)]" />
      <Twinkle color={SUN} className="start-[8%] top-[62%] size-[min(2.4vw,3.4vh)]" />
      <Hills className="h-[16vh] min-h-24" />
      {children}
    </div>
  );
}

// ————————————————————————— أجزاء الشاشة —————————————————————————

/** شريط الطبيب: شريط مستدير بلون العيادة الداكن (أو اسم العيادة إن غاب الطبيب). */
function DoctorRibbon({ lang, v, doctor }: Pick<LayoutProps, "lang" | "v" | "doctor">) {
  const title = doctor ?? v.name;
  return (
    <div className="flex min-w-0 flex-col items-start gap-[0.8vh]">
      {doctor && (
        <div className="flex max-w-full items-center gap-2 ps-2 text-[clamp(1rem,2.4vh,1.75rem)] leading-normal font-bold text-brand-800">
          <Heart className="size-[1em] shrink-0" fill={CORAL} stroke={CORAL} />
          <span className="line-clamp-1">{v.name}</span>
        </div>
      )}
      <div className="flex max-w-full items-center gap-[1.4vh] rounded-[999px] bg-brand-700 py-[1vh] ps-[1vh] pe-[3.2vh] text-white shadow-[0_10px_0_-4px_var(--color-brand-900)]">
        <span className="inline-flex size-[clamp(3rem,8.5vh,6.5rem)] shrink-0 portrait:sm:size-[clamp(3rem,6vh,5rem)] items-center justify-center rounded-full bg-white text-brand-700">
          <Stethoscope className="size-1/2" strokeWidth={2.4} />
        </span>
        <div className="min-w-0">
          <div className="line-clamp-2 text-[clamp(1.4rem,4.4vh,3.4rem)] leading-[1.4] font-extrabold portrait:sm:line-clamp-1 portrait:sm:text-[clamp(1.4rem,3.4vh,2.6rem)]">{title}</div>
          {v.profile.specialty && (
            <div className="line-clamp-1 text-[clamp(0.95rem,2.4vh,1.75rem)] leading-normal font-semibold text-brand-100">{v.profile.specialty}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Clock({ time, date }: { time: string; date: string }) {
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="rounded-[2rem] bg-white px-[3vh] py-[1vh] shadow-[0_8px_0_-3px_var(--color-brand-200)] ring-2 ring-brand-100">
        <div className="num text-[clamp(2rem,6.4vh,5rem)] leading-tight font-extrabold text-ink portrait:sm:text-[clamp(2rem,4vh,3.5rem)]" dir="ltr">
          {time || " "}
        </div>
      </div>
      <div className="pe-3 text-[clamp(0.9rem,2.2vh,1.6rem)] leading-normal font-semibold text-brand-900">{date}</div>
    </div>
  );
}

/** فقاعات الأرقام القادمة: الأولى بلون العيادة، الباقي حلوى ملوّنة. */
function NextBubbles({ lang, nums }: { lang: Lang; nums: number[] }) {
  if (nums.length === 0)
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-brand-50 px-4 py-[2vh] text-[clamp(1rem,2.6vh,1.6rem)] leading-normal font-semibold text-brand-900">
        <Smile className="size-[1.4em] shrink-0 text-brand-700" /> {t(lang, "emptyQueue")}
      </div>
    );
  const [first, ...rest] = nums;
  const candy = [SUN, CORAL];
  return (
    <div className="flex items-end justify-center gap-[2.2vh]">
      <div className="flex flex-col items-center gap-1">
        <span className="rounded-full bg-brand-700 px-3 text-[clamp(0.85rem,1.9vh,1.3rem)] leading-normal font-bold text-white">{t(lang, "db_upNext")}</span>
        <span className="num flex size-[clamp(5rem,14vh,10rem)] items-center justify-center rounded-full bg-[radial-gradient(circle_at_32%_28%,var(--color-brand-600),var(--color-brand-800)_75%)] text-[clamp(2.4rem,7vh,5rem)] font-bold text-white shadow-[inset_0_-6px_0_rgb(0_0_0/0.15)] ring-4 ring-white">
          {first}
        </span>
      </div>
      {rest.map((n, i) => (
        <span
          key={n}
          className="num flex size-[clamp(3.8rem,10.5vh,7.5rem)] items-center justify-center rounded-full text-[clamp(1.8rem,5vh,3.6rem)] font-bold text-ink shadow-[inset_0_-5px_0_rgb(0_0_0/0.1)] ring-4 ring-white"
          style={{ background: candy[i] }}
        >
          {n}
        </span>
      ))}
    </div>
  );
}

function Stat({ icon, label, value, tint }: { icon: ReactNode; label: string; value: string; tint: string }) {
  return (
    <div className="flex min-w-0 items-center gap-[1.4vh] rounded-[1.6rem] bg-white p-[1.3vh] pe-[2vh] ring-2 ring-brand-100 max-sm:flex-col max-sm:items-start max-sm:p-3">
      <span className="inline-flex size-[clamp(2.6rem,6.4vh,4.5rem)] shrink-0 max-sm:size-10 items-center justify-center rounded-full text-ink" style={{ background: tint }}>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="line-clamp-2 text-[clamp(0.85rem,2vh,1.35rem)] leading-tight font-semibold text-slate-600">{label}</div>
        {/* بلا dir="ltr": في العربية يأتي الرقم يميناً ثمّ الوحدة («10 د») كما يُقرأ */}
        <div className="num text-[clamp(1.5rem,4.2vh,3rem)] leading-tight font-extrabold whitespace-nowrap text-ink">
          {value}
        </div>
      </div>
    </div>
  );
}

function QrCard({ lang, qr }: { lang: Lang; qr: string }) {
  return (
    <div className="flex items-center gap-[2vh] rounded-[2rem] border-[3px] border-dashed border-brand-300 bg-white p-[1.6vh] text-ink">
      <div
        className="w-[clamp(110px,16vh,11rem)] shrink-0 rounded-2xl bg-white p-1 ring-4 ring-[#ffd166]"
        dangerouslySetInnerHTML={{ __html: qr }}
      />
      <div className="min-w-0">
        <div className="text-[clamp(1rem,2.7vh,1.9rem)] leading-normal font-extrabold">{t(lang, "posterTitle")}</div>
        <p className="mt-1 text-[clamp(0.8rem,1.9vh,1.3rem)] leading-normal text-slate-600">{t(lang, "dp_scan")}</p>
      </div>
    </div>
  );
}

// ————————————————————————— النداء —————————————————————————

const CONFETTI: { pos: string; color: string; shape: "dot" | "bar" | "star"; size: string; rot?: number }[] = [
  { pos: "start-[8%] top-[12%]", color: SUN, shape: "star", size: "size-[7vh]" },
  { pos: "start-[20%] top-[34%]", color: CORAL, shape: "dot", size: "size-[3vh]" },
  { pos: "start-[12%] top-[62%]", color: MINT, shape: "bar", size: "h-[2.4vh] w-[7vh]", rot: -30 },
  { pos: "start-[26%] top-[80%]", color: LILAC, shape: "star", size: "size-[5vh]" },
  { pos: "start-[30%] top-[8%]", color: MINT, shape: "dot", size: "size-[2.2vh]" },
  { pos: "end-[8%] top-[14%]", color: LILAC, shape: "bar", size: "h-[2.4vh] w-[7vh]", rot: 35 },
  { pos: "end-[22%] top-[30%]", color: SUN, shape: "dot", size: "size-[3.4vh]" },
  { pos: "end-[10%] top-[58%]", color: CORAL, shape: "star", size: "size-[6vh]" },
  { pos: "end-[26%] top-[78%]", color: MINT, shape: "bar", size: "h-[2.2vh] w-[6vh]", rot: -20 },
  { pos: "end-[30%] top-[6%]", color: CORAL, shape: "dot", size: "size-[2vh]" },
];

function KidsCallout({ lang, n, doctor, onClose }: { lang: Lang; n: number; doctor: string | null; onClose: () => void }) {
  return (
    <div role="alert" className="fixed inset-0 z-50 flex animate-fade-up flex-col items-center justify-center gap-[2vh] overflow-hidden bg-white px-6 text-center" onClick={onClose}>
      <Sky />
      {CONFETTI.map((c, i) => (
        <span
          key={i}
          aria-hidden
          className={`pointer-events-none absolute animate-pop ${c.pos} ${c.size} ${c.shape === "dot" ? "rounded-full" : c.shape === "bar" ? "rounded-full" : ""}`}
          style={{ background: c.shape === "star" ? undefined : c.color, rotate: c.rot ? `${c.rot}deg` : undefined, animationDelay: `${(i % 5) * 70}ms` }}
        >
          {c.shape === "star" && (
            <svg viewBox="0 0 24 24" className="size-full">
              <path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12C7 11 11 7 12 0Z" fill={c.color} />
            </svg>
          )}
        </span>
      ))}
      <div className="relative inline-flex -rotate-3 items-center gap-3 rounded-full px-[3vh] py-[0.6vh] text-[clamp(1.6rem,4.6vh,3.6rem)] leading-normal font-extrabold text-ink shadow-[0_6px_0_-2px_#e0a92e]" style={{ background: SUN }}>
        <Sparkles className="size-[0.9em]" /> {t(lang, "dp_number")}
      </div>
      <Balloon n={n} className="relative w-[min(46vh,70vw)]" />
      <div className="relative text-[clamp(2rem,6.4vh,5rem)] leading-normal font-extrabold text-brand-900">{t(lang, "dp_enter")}</div>
      {doctor && (
        <div className="relative inline-flex max-w-[90vw] items-center gap-3 rounded-full bg-brand-700 px-[3vh] py-[1vh] text-[clamp(1.2rem,3.4vh,2.6rem)] leading-normal font-bold text-white">
          <Stethoscope className="size-[1em] shrink-0" /> <span className="line-clamp-1">{doctor}</span>
        </div>
      )}
    </div>
  );
}

// ————————————————————————— التصميم —————————————————————————

function Layout({ lang, v, doctor, time, date, qr, callout, dismissCallout, voice, toggleVoice }: LayoutProps) {
  const cur = v.currentNumber;
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-white text-ink portrait:sm:h-dvh lg:landscape:h-dvh">
      <Sky>
        <Sun className="-end-[3vh] -top-[4vh] size-[min(24vh,22vw)] max-lg:landscape:hidden portrait:hidden" />
      </Sky>

      {/* ——— الأعلى: الطبيب + الساعة ——— */}
      <header className="relative z-10 flex flex-wrap items-start justify-between gap-4 px-[clamp(1rem,3vw,3.5rem)] pt-[clamp(1rem,3vh,2.5rem)] portrait:sm:flex-nowrap portrait:sm:pt-[2vh] lg:landscape:flex-nowrap">
        <DoctorRibbon lang={lang} v={v} doctor={doctor} />
        <div className="shrink-0 lg:landscape:me-[min(15vh,13vw)]">
          <Clock time={time} date={date} />
        </div>
      </header>

      <div className="relative z-20 mx-auto w-full max-w-md px-4 pt-2 empty:hidden lg:landscape:absolute lg:landscape:inset-x-0 lg:landscape:top-[1vh]">
        <SoundGate lang={lang} tone="light" />
      </div>

      {/* ——— الوسط: المنطاد + العمود الجانبي ——— */}
      <div className="relative z-10 grid flex-1 gap-[3vh] px-[clamp(1rem,3vw,3.5rem)] py-[2vh] portrait:sm:min-h-0 portrait:sm:content-center portrait:sm:gap-[2vh] lg:landscape:min-h-0 lg:landscape:grid-cols-[1.4fr_1fr] lg:landscape:items-center">
        <section className="flex min-w-0 flex-col items-center justify-center gap-[1.2vh] text-center portrait:sm:gap-[0.6vh]">
          <div className="relative">
            {cur !== null && (
              <div className="absolute -top-[0.5vh] -start-[min(10vh,14vw)] z-10 inline-flex -rotate-6 items-center gap-2 rounded-full px-[2.4vh] py-[0.4vh] text-[clamp(1.1rem,3.4vh,2.6rem)] leading-normal font-extrabold whitespace-nowrap text-ink shadow-[0_5px_0_-2px_#e0a92e] rtl:rotate-6" style={{ background: SUN }}>
                <Star className="size-[0.85em]" fill="currentColor" />
                {k(lang, "turn")}
              </div>
            )}
            <Balloon
              n={cur}
              testId="display-number"
              float
              className="w-[min(72vw,36vh)] portrait:sm:w-[min(56vw,23vh)] lg:landscape:w-[min(42vh,32vw)]"
            />
          </div>
          <p className="text-[clamp(1.5rem,4.4vh,3.4rem)] leading-normal font-extrabold text-brand-900">
            {cur !== null ? t(lang, "dp_enter") : t(lang, "dp_soon")}
          </p>
          {v.blocker && (
            <p className="inline-flex max-w-full items-center gap-2 rounded-full bg-white px-4 py-1 text-[clamp(0.9rem,2.1vh,1.4rem)] leading-normal font-semibold text-slate-700 ring-2 ring-[#ff8fa3]">
              <Info className="size-[1.1em] shrink-0 text-[#d6455f]" /> {errorText(lang, v.blocker)}
            </p>
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-[2vh] portrait:sm:grid portrait:sm:grid-cols-2 portrait:sm:items-stretch max-lg:landscape:grid max-lg:landscape:grid-cols-2">
          <div className="rounded-[2.2rem] portrait:sm:col-span-2 portrait:sm:p-[1.8vh] bg-white p-[2.2vh] shadow-[0_10px_0_-4px_var(--color-brand-200)] ring-2 ring-brand-100">
            <div className="mb-[1.6vh] flex items-center gap-2 text-[clamp(1.1rem,2.9vh,2rem)] leading-normal font-extrabold text-brand-900">
              <Sparkles className="size-[1em] shrink-0 text-brand-700" /> {t(lang, "dp_upcoming")}
            </div>
            <NextBubbles lang={lang} nums={v.nextNumbers} />
          </div>
          <div className="flex flex-col gap-[2vh] portrait:sm:contents">
            <div className="grid grid-cols-2 gap-[1.6vh] portrait:sm:grid-cols-1">
              <Stat icon={<Users className="size-1/2" />} label={t(lang, "waitingCount")} value={String(v.waiting)} tint={LILAC} />
              <Stat icon={<Clock3 className="size-1/2" />} label={t(lang, "dp_avg")} value={t(lang, "dp_min", { n: v.avgServiceMin })} tint={MINT} />
            </div>
            <QrCard lang={lang} qr={qr} />
          </div>
        </aside>
      </div>

      {/* ——— الأسفل: فوق التلال ——— */}
      <footer className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-[clamp(1rem,3vw,3.5rem)] pb-[1.6vh] text-[clamp(0.8rem,1.7vh,1.1rem)] leading-normal text-brand-900">
        <span className="flex items-center gap-2">
          <LogoMark size={20} /> {t(lang, "dp_footer")}
        </span>
        <Controls lang={lang} voice={voice} toggleVoice={toggleVoice} tone="light" className="opacity-70 hover:opacity-100" />
      </footer>

      {callout !== null && <KidsCallout lang={lang} n={callout} doctor={doctor} onClose={dismissCallout} />}
    </main>
  );
}

// ————————————————————————— المصغّر —————————————————————————

function Thumb() {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[linear-gradient(180deg,var(--color-brand-100),#fff_65%)]" aria-hidden>
      <Sun className="-end-2 -top-3 w-14" />
      <Cloud className="start-[44%] top-[12%] w-10" />
      <Cloud className="start-[3%] top-[48%] w-9 opacity-90" />
      <Hills className="h-[24%]" />
      <div className="absolute start-2 top-2 flex items-center gap-1 rounded-full bg-brand-700 py-0.5 ps-0.5 pe-2.5">
        <span className="size-3 rounded-full bg-white" />
        <span className="h-1.5 w-10 rounded-full bg-white/80" />
      </div>
      <Balloon n={12} className="absolute start-[22%] top-[17%] w-[25%]" />
      <div className="absolute end-[7%] top-[36%] flex w-[38%] flex-col items-center gap-1.5 rounded-lg bg-white p-1.5 ring-1 ring-brand-100">
        <div className="flex items-end gap-1">
          <span className="size-5 rounded-full bg-brand-700 ring-2 ring-white" />
          <span className="size-4 rounded-full ring-2 ring-white" style={{ background: SUN }} />
          <span className="size-4 rounded-full ring-2 ring-white" style={{ background: CORAL }} />
        </div>
        <div className="flex w-full items-center gap-1 rounded-md border border-dashed border-brand-300 p-0.5">
          <span className="size-4 rounded-sm bg-[repeating-linear-gradient(90deg,#0b1b2b_0_2px,#fff_2px_4px)] ring-1 ring-[#ffd166]" />
          <span className="h-1 flex-1 rounded-full bg-slate-300" />
        </div>
      </div>
    </div>
  );
}

export const kids: LayoutDef = { Layout, Thumb };
