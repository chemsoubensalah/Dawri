"use client";
import { Stethoscope } from "lucide-react";
import SoundGate from "@/components/SoundGate";
import { LogoMark } from "@/components/ui";
import type { Lang } from "@/lib/domain/types";
import { errorText, t } from "@/lib/i18n";
import { Controls } from "./shared";
import type { LayoutDef, LayoutProps } from "./types";

/**
 * «أنيق»: بهو عيادة خاصّة راقية. لوحة داكنة بلون العيادة تقدّم الطبيب تحت قوس رفيع (باب)،
 * وورق أبيض دافئ يحمل الرقم بخطّ رفيع عملاق. لا ظلال ولا تدرّجات صاخبة: خطوط شعرية ومحاذاة وفراغ.
 * ثلاثة أوضاع:
 * - «منقسم» (أفقي ≥1024px ← lg:landscape): اللوحة بجانب الورق، مقاسات vh كي لا يفيض شيء عمودياً.
 * - «عريض بالطول» (≥768px ← md): اللوحة شريط علوي، القوس للطبيب و QR بجانبه.
 * - «هاتف»: كلّ شيء في عمود، والقوس يضمّ الطبيب و QR.
 */

// ورق دافئ، وحبر مشوب قليلاً بلون العيادة (أعلى تباين على الشاشة)
const PAPER = "bg-[#faf8f5]";
const INK = "text-[color:color-mix(in_srgb,var(--color-brand-950)_22%,#0b1b2b)]";
// خطّ شعري على الورق
const RULE = "border-brand-900/10";
// تسمية صغيرة: اللاتينية بحروف كبيرة متباعدة، والعربية بلا تباعد (التباعد يقطع وصل الحروف)
const LABEL = "leading-normal ltr:uppercase ltr:tracking-[0.22em]";
const LABEL_SIZE = "text-[clamp(0.8rem,2.6vw,1.5rem)] lg:landscape:text-[max(11px,min(1.9vh,1.1vw))]";
// حركة واحدة عند تغيّر الرقم: صعود هادئ (transform/opacity فقط)
const RISE = "motion-safe:animate-[dw-elegant-rise_0.9s_cubic-bezier(0.2,0.7,0.2,1)_both]";

/**
 * مقاس الرقم حسب عدد خاناته (7، 42، 128، 1024) — أكبر ما يمكن دون أن يفيض.
 * «منقسم» محدود بالارتفاع: الرقم يملأ الوسط. تلفاز بالطول (≥1400px ارتفاعاً) له درجة أكبر تملأ العمود.
 * heroTight: حين يظهر سطر العائق تحت الرقم، نعود درجة كي لا يُدفع التذييل خارج الشاشة.
 */
const SIZES = {
  hero: [
    "text-[min(70vw,28vh)] [@media(orientation:portrait)_and_(min-height:1400px)]:text-[min(70vw,38vh)] lg:landscape:text-[min(52vh,34vw)]",
    "text-[min(58vw,26vh)] [@media(orientation:portrait)_and_(min-height:1400px)]:text-[min(58vw,34vh)] lg:landscape:text-[min(48vh,30vw)]",
    "text-[min(44vw,19vh)] [@media(orientation:portrait)_and_(min-height:1400px)]:text-[min(44vw,26vh)] lg:landscape:text-[min(38vh,22vw)]",
  ],
  heroTight: [
    "text-[min(70vw,28vh)] [@media(orientation:portrait)_and_(min-height:1400px)]:text-[min(70vw,34vh)] lg:landscape:text-[min(44vh,34vw)]",
    "text-[min(58vw,26vh)] [@media(orientation:portrait)_and_(min-height:1400px)]:text-[min(58vw,31vh)] lg:landscape:text-[min(41vh,30vw)]",
    "text-[min(44vw,19vh)] [@media(orientation:portrait)_and_(min-height:1400px)]:text-[min(44vw,24vh)] lg:landscape:text-[min(34vh,22vw)]",
  ],
  call: ["text-[min(54vh,70vw)]", "text-[min(46vh,52vw)]", "text-[min(36vh,40vw)]"],
} as const;

function sizeOf(n: number, sizes: readonly string[]) {
  const d = String(n).length;
  return sizes[d <= 2 ? 0 : d === 3 ? 1 : 2];
}

// ألقاب وكلمات عامّة لا تصلح حرفاً للشعار
const SKIP =
  /^(د|دكتور|دكتورة|الدكتور|الدكتورة|طبيب|طبيبة|الطبيب|الطبيبة|الأستاذ|الأستاذة|البروفيسور|عيادة|عيادات|مكتب|مركز|مصحة|طب|الطب|طبي|الطبي|طبية|الطبية|بن|ابن|بنت|dr|docteur|doctoresse|pr|professeur|cabinet|clinique|centre|médical|medical|médicale|dentaire|du|de|des|la|le|les|el|al|ben|bin|d|l)$/i;

/** حروف الشعار من الاسم بلا ألقاب: «أ.ع» بالعربية (النقطة تمنع قراءتها كلمة)، «AB» باللاتينية. */
function monogram(name: string): { text: string; arabic: boolean } {
  const words = name
    .split(/[\s'’]+/)
    .map((w) => w.replace(/[^\p{L}]/gu, ""))
    .filter((w) => w && !SKIP.test(w));
  const head = (w: string | undefined) => (w ? (Array.from(w.replace(/^ال(?=\p{L}{2})/u, ""))[0] ?? "") : "");
  const first = words[0];
  if (!first) return { text: "", arabic: false };
  if (/\p{Script=Arabic}/u.test(first)) return { text: [head(first), head(words[1])].filter(Boolean).join("."), arabic: true };
  return { text: (head(first) + head(words.length > 1 ? words[words.length - 1] : undefined)).toLocaleUpperCase("fr"), arabic: false };
}

/** خطّ شعري بماسة صغيرة في وسطه — توقيع التصميم (يأخذ لونه من currentColor). */
function Ornament({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`flex items-center gap-[0.8em] ${className}`}>
      <span className="h-px w-[3.2em] bg-current opacity-45" />
      <span className="size-[0.5em] rotate-45 border border-current" />
      <span className="h-px w-[3.2em] bg-current opacity-45" />
    </span>
  );
}

/** تسمية صغيرة بين خطّين شعريين. */
function Caption({ children, className = "" }: { children: string; className?: string }) {
  return (
    <p className={`flex items-center gap-[1em] text-brand-700 ${className}`}>
      <span aria-hidden className="h-px w-[2.6em] bg-current opacity-40" />
      <span className={LABEL}>{children}</span>
      <span aria-hidden className="h-px w-[2.6em] bg-current opacity-40" />
    </p>
  );
}

/** القوس: باب بخطّين شعريين متّحدَي المركز، مفتوح من الأسفل (زخرفة خلف المحتوى). */
function Arch({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-0 rounded-t-full border border-b-0 border-brand-300/30 bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--color-brand-800)_50%,transparent),transparent_70%)] ${className}`}
    >
      <span className="absolute inset-[max(6px,0.9vh)] bottom-0 rounded-t-full border border-b-0 border-brand-300/15" />
    </span>
  );
}

/** ميدالية بحلقتين رفيعتين وحروف الطبيب (أو العيادة). */
function Medallion({ name }: { name: string }) {
  const m = monogram(name);
  return (
    <div
      aria-hidden
      className="relative flex size-[clamp(4.5rem,18vw,7rem)] shrink-0 items-center justify-center rounded-full border border-brand-300/50 bg-brand-950 md:size-[min(9rem,12vw)] lg:landscape:size-[min(15vh,9vw)]"
    >
      <span className="absolute inset-[7%] rounded-full border border-brand-300/25" />
      {m.text ? (
        <span
          className={`text-[clamp(1.9rem,7.5vw,3rem)] leading-normal text-brand-100 md:text-[min(3.75rem,5vw)] lg:landscape:text-[min(6.2vh,3.7vw)] ${
            m.arabic ? "font-light" : "font-extralight tracking-[0.04em]"
          }`}
        >
          {m.text}
        </span>
      ) : (
        <Stethoscope className="size-[38%] text-brand-200" strokeWidth={1} />
      )}
    </div>
  );
}

/** اللوحة الداكنة (البداية): الطبيب تحت القوس، و QR في أسفله (أو بجانبه في الشاشة العريضة بالطول). */
function Plaque({ lang, v, doctor, qr }: Pick<LayoutProps, "lang" | "v" | "doctor" | "qr">) {
  // بلا اسم طبيب: العيادة هي العنوان (لا خانة فارغة)
  const title = doctor ?? v.name;
  const sub = doctor ? v.name : v.profile.address;
  return (
    <aside className="relative flex flex-col overflow-hidden bg-brand-950 px-[max(1rem,6vw)] pt-[max(1.25rem,4vw)] text-white lg:landscape:px-[3.4vw] lg:landscape:pt-[5vh]">
      {/* ضوء مائل خافت من الزاوية العليا — يُعكس في العربية */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(150deg,color-mix(in_srgb,var(--color-brand-800)_55%,transparent),transparent_50%)] rtl:bg-[linear-gradient(210deg,color-mix(in_srgb,var(--color-brand-800)_55%,transparent),transparent_50%)]"
      />
      <div className="relative mx-auto mb-[max(1rem,2.4vw)] w-full max-w-md empty:hidden lg:landscape:mb-[2.4vh]">
        <SoundGate lang={lang} tone="dark" />
      </div>

      <div className="relative mx-auto flex w-full max-w-[36rem] flex-1 flex-col md:max-w-none md:flex-row md:gap-[5vw] lg:landscape:flex-col lg:landscape:gap-0">
        {/* القوس يضمّ الكلّ (هاتف، منقسم) أو الطبيب وحده (عريض بالطول) */}
        <Arch className="md:hidden lg:landscape:block" />
        <div className="relative flex flex-col items-center justify-center px-[7%] lg:landscape:px-[5%] pt-[clamp(1.75rem,7vw,4rem)] pb-[max(1rem,2.4vw)] text-center md:flex-1 md:pt-[4.5vw] md:pb-[3vw] lg:landscape:pt-[5vh] lg:landscape:pb-[3vh]">
          <Arch className="hidden md:block lg:landscape:hidden" />
          <div className="relative flex flex-col items-center">
            <Medallion name={title} />
            <h1 className="mt-[max(0.9rem,2.4vw)] text-[clamp(1.4rem,5.4vw,3.4rem)] leading-[1.5] font-normal text-balance text-white ltr:font-light md:text-[min(3rem,4.6vw)] lg:landscape:mt-[2.6vh] lg:landscape:text-[min(4.8vh,2.8vw)]">
              {title}
            </h1>
            {v.profile.specialty && (
              <p className={`mt-[0.3em] text-[clamp(0.9rem,3vw,1.75rem)] text-brand-200 lg:landscape:text-[min(2.4vh,1.4vw)] ${LABEL}`}>
                {v.profile.specialty}
              </p>
            )}
            <Ornament className="my-[max(0.8rem,2vw)] text-[clamp(10px,1.6vw,16px)] text-brand-300 lg:landscape:my-[2.2vh] lg:landscape:text-[min(1.5vh,0.9vw)]" />
            {sub && (
              <p className="text-[clamp(1rem,3.4vw,2rem)] leading-normal font-light text-balance text-white/80 lg:landscape:text-[min(2.7vh,1.6vw)]">{sub}</p>
            )}
          </div>
        </div>

        {/* QR: يبقى على أبيض كي يُمسح */}
        <div className="relative mx-[7%] flex items-center gap-4 border-t border-brand-300/20 py-[max(1rem,3.2vw)] text-start md:mx-0 md:w-[min(17rem,30%)] md:shrink-0 md:flex-col md:items-start md:justify-center md:gap-5 md:border-t-0 md:py-[3vw] lg:landscape:mx-[7%] lg:landscape:w-auto lg:landscape:flex-row lg:landscape:items-center lg:landscape:gap-[max(0.9rem,1.3vw)] lg:landscape:border-t lg:landscape:py-[max(1rem,3.4vh)]">
          <div
            className="w-[clamp(6rem,24vw,9rem)] shrink-0 rounded-[3px] bg-white p-[max(5px,0.6vh)] [&>svg]:block [&>svg]:h-auto [&>svg]:w-full md:w-[min(13rem,100%)] lg:landscape:w-[max(110px,14vh)]"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <div className="min-w-0">
            <p className="text-[clamp(0.95rem,3vw,1.6rem)] leading-[1.6] text-pretty text-white lg:landscape:text-[min(2.3vh,1.35vw)]">{t(lang, "posterTitle")}</p>
            <p className="mt-[0.4em] text-[clamp(0.8rem,2.4vw,1.25rem)] leading-[1.7] text-pretty text-brand-200/85 lg:landscape:text-[min(1.75vh,1.05vw)]">
              {t(lang, "dp_scan")}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

/** إحصاء صغير: تسمية وقيمة بخطّ رفيع. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={`border-s ${RULE} ps-[max(0.9rem,1.4vw)] max-md:first:border-s-0 max-md:first:ps-0`}>
      {/* بالمنقسم: التسمية بمقاس «الأرقام القادمة» وعلى سطرها، والقيمة في صندوق بارتفاع الأرقام القادمة ومحاذاة لأسفله كي تتشارك الخطّ الأساس */}
      <dt className="text-[clamp(0.8rem,2.6vw,1.4rem)] leading-normal text-brand-700 lg:landscape:text-[max(11px,min(1.9vh,1.1vw))]">{label}</dt>
      <dd className="num mt-[0.1em] text-[clamp(1.4rem,5.5vw,3.2rem)] leading-tight font-light lg:landscape:mt-[0.9vh] lg:landscape:flex lg:landscape:h-[min(7.4vh,4.3vw)] lg:landscape:items-end lg:landscape:pb-[0.6vh] lg:landscape:text-[min(3.6vh,2.1vw)] lg:landscape:leading-none">
        {value}
      </dd>
    </div>
  );
}

/** الأرقام القادمة: صفّ تفصله خطوط شعرية، والأوّل بلون العيادة مع «التالي». */
function Upcoming({ lang, v }: Pick<LayoutProps, "lang" | "v">) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-x-[3vw] gap-y-5 lg:landscape:items-start border-t ${RULE} py-[max(1rem,2.4vw)] lg:landscape:py-[1.8vh]`}>
      <div className="min-w-0">
        <p className={`text-brand-700 ${LABEL_SIZE} ${LABEL}`}>{t(lang, "dp_upcoming")}</p>
        {v.nextNumbers.length > 0 ? (
          <ol className="mt-[max(0.4rem,1vw)] flex items-start lg:landscape:mt-[0.9vh]">
            {v.nextNumbers.map((x, i) => (
              <li key={x} className={`flex flex-col items-center px-[max(0.9rem,2.6vw)] first:ps-0 md:px-[3vw] lg:landscape:px-[2vw] ${i > 0 ? `border-s ${RULE}` : ""}`}>
                <span
                  className={`num text-[clamp(2.2rem,10vw,5.5rem)] leading-none font-light lg:landscape:text-[min(7.4vh,4.3vw)] ${
                    i === 0 ? "text-brand-700" : "opacity-60"
                  }`}
                >
                  {x}
                </span>
                {i === 0 && (
                  <span
                    className={`mt-[max(0.35rem,0.8vw)] w-full border-t-2 lg:landscape:mt-[0.8vh] border-brand-600 pt-[0.2em] text-center text-[clamp(0.7rem,2.2vw,1.2rem)] text-brand-700 lg:landscape:text-[max(10px,min(1.45vh,0.85vw))] ${LABEL}`}
                  >
                    {t(lang, "db_upNext")}
                  </span>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-[max(0.4rem,1vw)] text-[clamp(1.1rem,4vw,2.2rem)] lg:landscape:mt-[0.9vh] leading-normal font-light opacity-60 lg:landscape:text-[min(3vh,1.8vw)]">
            {t(lang, "emptyQueue")}
          </p>
        )}
      </div>
      <dl className="flex w-full gap-x-[max(0.9rem,1.4vw)] md:w-auto">
        <Stat label={t(lang, "waitingCount")} value={String(v.waiting)} />
        <Stat label={t(lang, "dp_avg")} value={t(lang, "dp_min", { n: v.avgServiceMin })} />
      </dl>
    </div>
  );
}

/** الورق (النهاية): التاريخ والساعة، الرقم الحالي، القادمة، التذييل. */
function Stage({ lang, v, time, date, voice, toggleVoice }: Pick<LayoutProps, "lang" | "v" | "time" | "date" | "voice" | "toggleVoice">) {
  const n = v.currentNumber;
  return (
    <section className="relative flex min-w-0 flex-col px-[max(1rem,6vw)] lg:landscape:px-[4.6vw]">
      <header className={`flex items-end justify-between gap-6 border-b ${RULE} pt-[max(1.25rem,3vw)] pb-[max(0.9rem,2vw)] lg:landscape:pt-[2.6vh] lg:landscape:pb-[1.8vh]`}>
        <p className="min-w-0 text-[clamp(0.95rem,3vw,1.75rem)] leading-normal font-light text-brand-800 lg:landscape:text-[min(2.4vh,1.4vw)]">{date}</p>
        <p dir="ltr" className="num shrink-0 text-[clamp(1.8rem,7vw,4.25rem)] leading-none font-extralight lg:landscape:text-[min(5vh,2.9vw)]">
          {time || " "}
        </p>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center py-[max(1.25rem,2.5vw)] text-center lg:landscape:py-[1.6vh]">
        {n !== null ? (
          <>
            <Caption className={LABEL_SIZE}>{t(lang, "displayNow")}</Caption>
            <p
              key={n}
              data-testid="display-number"
              className={`num mt-[max(0.5rem,1.2vw)] leading-[0.92] font-light tracking-[-0.03em] lg:landscape:mt-[0.6vh] ${sizeOf(n, v.blocker ? SIZES.heroTight : SIZES.hero)} ${RISE}`}
            >
              {n}
            </p>
            <Ornament className="mt-[max(1rem,3vw)] text-[clamp(10px,1.8vw,18px)] text-brand-600 lg:landscape:mt-[1.6vh] lg:landscape:text-[min(1.7vh,1vw)]" />
            <p className="mt-[max(0.75rem,2vw)] text-[clamp(1.3rem,5vw,2.8rem)] leading-normal font-light text-brand-800 [@media(orientation:portrait)_and_(min-height:1400px)]:text-[min(4.5vh,6vw)] lg:landscape:mt-[1vh] lg:landscape:text-[min(3.6vh,2.1vw)]">
              {t(lang, "dp_enter")}
            </p>
          </>
        ) : (
          // قبل بدء الاستقبال: الرسالة هي البطل — ميدالية رفيعة وماسة ثمّ «يبدأ الاستقبال قريباً»، متوسّطة بلا فراغ ميّت
          <div key="none" className={`flex flex-col items-center ${RISE}`}>
            <span
              aria-hidden
              className="relative flex size-[clamp(4.5rem,16vw,8rem)] items-center justify-center rounded-full border border-brand-600/40 text-brand-600 lg:landscape:size-[min(14vh,8vw)]"
            >
              <span className="absolute inset-[7%] rounded-full border border-brand-600/20" />
              <Stethoscope className="size-[38%]" strokeWidth={1} />
            </span>
            <Ornament className="mt-[max(1.25rem,3.4vw)] text-[clamp(12px,2.4vw,22px)] text-brand-600 lg:landscape:mt-[3vh] lg:landscape:text-[min(2.4vh,1.4vw)]" />
            <p
              data-testid="display-number"
              className="mt-[max(1rem,2.6vw)] text-[clamp(1.8rem,7vw,4rem)] leading-normal font-light text-balance text-brand-800 [@media(orientation:portrait)_and_(min-height:1400px)]:text-[min(5vh,7vw)] lg:landscape:mt-[2.4vh] lg:landscape:text-[min(7vh,4.2vw)]"
            >
              {t(lang, "dp_soon")}
            </p>
          </div>
        )}
        {v.blocker && (
          <p className="mt-[max(0.6rem,1.5vw)] inline-flex lg:landscape:mt-[1.2vh] items-center gap-[0.6em] rounded-full border border-slate-300 px-[1em] py-[0.15em] text-[clamp(0.8rem,2.6vw,1.4rem)] leading-normal text-slate-600 lg:landscape:text-[max(11px,min(1.8vh,1.05vw))]">
            <span aria-hidden className="size-[0.45em] shrink-0 rounded-full bg-slate-400" />
            {errorText(lang, v.blocker)}
          </p>
        )}
      </div>

      <Upcoming lang={lang} v={v} />

      <footer
        className={`flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t ${RULE} py-[max(0.6rem,1.6vw)] text-xs text-slate-500 lg:landscape:py-[1.2vh] lg:landscape:flex-nowrap lg:landscape:text-[max(11px,1.25vh)]`}
      >
        <span className="flex min-w-0 items-center gap-2 leading-normal text-pretty">
          <LogoMark size={16} className="shrink-0 opacity-80" /> {t(lang, "dp_footer")}
        </span>
        {/* أزرار هادئة صغيرة: تظهر كاملة عند المرور أو التركيز */}
        <Controls
          lang={lang}
          voice={voice}
          toggleVoice={toggleVoice}
          tone="light"
          className="shrink-0 opacity-50 transition-opacity focus-within:opacity-100 hover:opacity-100 [&>button]:px-3 [&>button]:py-1 [&>button]:text-xs"
        />
      </footer>
    </section>
  );
}

/** النداء: ورق كامل، وقوس رفيع كباب مفتوح يدعو إلى الدخول، والرقم في وسطه بخطّ رفيع عملاق. */
function Call({ lang, n, doctor, onClose }: { lang: Lang; n: number; doctor: string | null; onClose: () => void }) {
  return (
    <div
      role="alert"
      onClick={onClose}
      className={`fixed inset-0 z-50 flex cursor-pointer items-end justify-center overflow-hidden bg-[#f1ece4] ${INK} motion-safe:animate-[dw-elegant-fade_0.45s_ease-out_both]`}
    >
      <div className="relative flex h-[91dvh] w-[min(112vh,88vw)] flex-col items-center justify-end rounded-t-full border border-b-0 border-brand-600/50 portrait:justify-center bg-[#fdfcfa] px-[4%] pb-[max(1.5rem,7vh)] text-center">
        <span aria-hidden className="pointer-events-none absolute -inset-[max(8px,1.5vh)] bottom-0 rounded-t-full border border-b-0 border-brand-600/20" />
        <div className={`flex flex-col items-center ${RISE}`}>
          <Caption className="text-[clamp(0.95rem,2.8vh,2rem)]">{t(lang, "dp_number")}</Caption>
          <p className={`num mt-[1vh] leading-[0.92] font-extralight tracking-[-0.03em] ${sizeOf(n, SIZES.call)}`}>{n}</p>
          <Ornament className="mt-[2.4vh] text-[clamp(10px,1.8vh,20px)] text-brand-600" />
          <p className="mt-[1.6vh] text-[min(6.4vh,9vw)] leading-normal font-light">{t(lang, "dp_enter")}</p>
          {doctor && <p className="mt-[0.4vh] text-[min(3.2vh,5vw)] leading-normal text-brand-800">{doctor}</p>}
        </div>
      </div>
    </div>
  );
}

function Layout({ lang, v, doctor, time, date, qr, callout, dismissCallout, voice, toggleVoice }: LayoutProps) {
  return (
    <main
      className={`relative grid min-h-dvh grid-rows-[auto_1fr] ${PAPER} ${INK} lg:landscape:h-dvh lg:landscape:grid-cols-[minmax(0,40fr)_minmax(0,60fr)] lg:landscape:grid-rows-1 lg:landscape:overflow-hidden`}
    >
      <Plaque lang={lang} v={v} doctor={doctor} qr={qr} />
      <Stage lang={lang} v={v} time={time} date={date} voice={voice} toggleVoice={toggleVoice} />
      {callout !== null && <Call lang={lang} n={callout} doctor={doctor} onClose={dismissCallout} />}
    </main>
  );
}

/** مصغّر: لوحة داكنة بقوس وميدالية + ورق برقم رفيع كبير. */
function Thumb() {
  return (
    <div aria-hidden className="@container relative flex aspect-video w-full overflow-hidden rounded-xl bg-[#faf8f5] ring-1 ring-black/5">
      <div className="relative flex w-[40%] flex-col bg-brand-950 px-[3.2cqw] pt-[3.4cqw]">
        <div className="relative flex flex-1 flex-col items-center rounded-t-full border border-b-0 border-brand-300/45 bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--color-brand-800)_65%,transparent),transparent_75%)] pt-[3.6cqw]">
          <span className="flex size-[9cqw] items-center justify-center rounded-full border border-brand-300/70 p-[0.7cqw]">
            <span className="size-full rounded-full border border-brand-300/35" />
          </span>
          <span className="mt-[2.2cqw] h-[1.3cqw] w-[20cqw] rounded-full bg-white/85" />
          <span className="mt-[1.3cqw] h-[0.9cqw] w-[12cqw] rounded-full bg-brand-300/60" />
          <span className="mt-auto mb-[2.4cqw] size-[9.5cqw] rounded-[2px] bg-white p-[1cqw]">
            <svg viewBox="0 0 10 10" className="size-full">
              <g fill="none" stroke="#0b1b2b">
                <rect x=".5" y=".5" width="3" height="3" />
                <rect x="6.5" y=".5" width="3" height="3" />
                <rect x=".5" y="6.5" width="3" height="3" />
              </g>
              <path d="M1.5 1.5h1v1h-1zM7.5 1.5h1v1h-1zM1.5 7.5h1v1h-1zM5 5h1v1H5zM7 6h1v1H7zM6 8h1v1H6zM8 8h1v1H8zM5 7h1v1H5zM8 5h1v1H8z" fill="#0b1b2b" />
            </svg>
          </span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col px-[4cqw] pt-[3cqw] pb-[2.6cqw] text-[#0b1b2b]">
        <div className="flex items-center justify-between border-b border-brand-900/10 pb-[1.6cqw]">
          <span className="h-[0.9cqw] w-[14cqw] rounded-full bg-brand-800/35" />
          <span className="h-[1.6cqw] w-[8cqw] rounded-full bg-[#0b1b2b]/25" />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center">
          <span className="h-[0.7cqw] w-[12cqw] rounded-full bg-brand-700/40" />
          <span className="num mt-[0.8cqw] text-[22cqw] leading-[0.95] font-extralight tracking-[-0.03em]">12</span>
          <span className="mt-[1.4cqw] flex items-center gap-[0.9cqw] text-brand-600">
            <span className="h-px w-[5cqw] bg-current opacity-60" />
            <span className="size-[1cqw] rotate-45 border border-current" />
            <span className="h-px w-[5cqw] bg-current opacity-60" />
          </span>
        </div>
        <div className="flex items-end justify-between border-t border-brand-900/10 pt-[1.8cqw]">
          <span className="num flex text-[5cqw] leading-none font-light">
            <span className="border-b border-brand-600 pe-[1.6cqw] pb-[0.5cqw] text-brand-700">13</span>
            <span className="border-s border-brand-900/15 px-[1.6cqw] opacity-60">14</span>
            <span className="border-s border-brand-900/15 ps-[1.6cqw] opacity-60">15</span>
          </span>
          <span className="flex flex-col items-end gap-[0.8cqw]">
            <span className="h-[0.8cqw] w-[9cqw] rounded-full bg-brand-700/35" />
            <span className="h-[1.4cqw] w-[6cqw] rounded-full bg-[#0b1b2b]/25" />
          </span>
        </div>
      </div>
    </div>
  );
}

export const elegant: LayoutDef = { Layout, Thumb };
