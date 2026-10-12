"use client";
import type { ReactNode } from "react";
import { CircleAlert, Stethoscope } from "lucide-react";
import SoundGate from "@/components/SoundGate";
import { LogoMark } from "@/components/ui";
import type { Lang } from "@/lib/domain/types";
import { errorText, t } from "@/lib/i18n";
import { Controls } from "./shared";
import type { LayoutDef, LayoutProps } from "./types";

/**
 * «تركيز»: لافتة مستشفى بروح سويسرية — الرقم الحالي يملأ الشاشة أبيضَ على شبه أسود،
 * ولون العيادة لمسة واحدة جريئة: خطّ سميك تحت الرقم + أوّل رقم قادم.
 * كلّ المقاسات بوحدة em واحدة (UNIT) فتتناسب الشاشة كلّها من الهاتف إلى التلفاز.
 */

// شبه أسود مشوب قليلاً بلون العيادة (دافئ مع الكهرماني، بارد مع الكحلي)
const INK = "bg-[color-mix(in_srgb,var(--color-brand-950)_22%,#07080a)]";
// وحدة الطباعة: 20px على تلفاز 1080p، وأصغر بالتناسب على الحاسوب، و14px على الأقلّ في الهاتف
const UNIT = "text-[clamp(14px,min(1.85vh,1.04vw),44px)] portrait:text-[clamp(14px,min(1.2vh,2.1vw),44px)]";
// الهامش الجانبي نفسه لكلّ الأقسام (شبكة واحدة)
const GUTTER = "px-[3.5em] portrait:px-[min(2.2em,5vw)]";
// تسمية صغيرة: اللاتينية بحروف كبيرة متباعدة، والعربية بلا تباعد (التباعد يكسر وصل الحروف)
const LABEL = "font-medium leading-normal ltr:uppercase ltr:tracking-[0.14em]";
const RULE = "border-white/10";
// حركتان فقط عند تغيّر الرقم (transform/opacity): صعود الرقم ومسح الخطّ الملوّن
const RISE = "motion-safe:animate-[dw-focus-rise_0.6s_cubic-bezier(0.2,0.8,0.2,1)_both]";
const WIPE = "motion-safe:animate-[dw-focus-wipe_0.8s_cubic-bezier(0.65,0,0.35,1)_both]";
// أرقام عملاقة متقاربة؛ في rtl يُضاف التباعد السالب بعد آخر رقم فيدفعه خارج الهامش، فنعوّضه
const GIANT = "num leading-[0.8] tracking-[-0.03em] rtl:pr-[0.03em]";

/** مقاس الرقم العملاق حسب عدد خاناته — يملأ الشاشة دون أن يفيض (7، 42، 128). */
const SIZES = {
  hero: [
    "text-[min(63vh,56vw)] portrait:text-[min(42vh,78vw)]",
    "text-[min(63vh,38vw)] portrait:text-[min(34vh,54vw)]",
    "text-[min(52vh,28vw)] portrait:text-[min(26vh,40vw)]",
  ],
  // النداء: والحدّ الثالث يترك مكاناً للشريط الداكن في الشاشات القصيرة (هاتف بالعرض)
  call: [
    "text-[min(72vh,62vw,125vh_-_24em)] portrait:text-[min(46vh,80vw)]",
    "text-[min(72vh,50vw,125vh_-_24em)] portrait:text-[min(38vh,56vw)]",
    "text-[min(60vh,38vw,125vh_-_24em)] portrait:text-[min(30vh,42vw)]",
  ],
} as const;

function sized(kind: keyof typeof SIZES, n: number | null) {
  const d = n === null ? 1 : String(n).length;
  return SIZES[kind][d <= 2 ? 0 : d === 3 ? 1 : 2];
}

/** مربّع صغير بلون العيادة + تسمية: علامة الأقسام في الشبكة. */
function Label({
  children,
  mark = "bg-brand-500",
  className = "text-[0.9em] text-white/60",
}: {
  children: string;
  mark?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-[0.7em] ${LABEL} ${className}`}>
      <span aria-hidden className={`size-[0.7em] shrink-0 ${mark}`} />
      {children}
    </div>
  );
}

/** السطر العلوي: الطبيب والتخصّص والعيادة في البداية، الساعة والتاريخ في النهاية. */
function Masthead({ v, doctor, time, date }: Pick<LayoutProps, "v" | "doctor" | "time" | "date">) {
  const spec = v.profile.specialty?.trim();
  // بلا اسم طبيب: اسم العيادة يأخذ مكانه فلا يبقى فراغ
  const sub = doctor ? v.name : null;
  return (
    <header
      className={`flex items-start justify-between gap-x-[2.5em] gap-y-[0.9em] border-b pt-[1.4em] pb-[1.1em] max-sm:flex-col-reverse ${RULE}`}
    >
      <div className="min-w-0">
        <h1 className="text-[2.2em] leading-normal font-bold text-balance max-sm:text-[1.8em]">{doctor ?? v.name}</h1>
        {(spec || sub) && (
          <p className="text-[1.15em] leading-normal text-white/60">
            {spec && <span className="font-semibold text-brand-300">{spec}</span>}
            {spec && sub && (
              <span aria-hidden className="mx-[0.6em] text-white/25">
                /
              </span>
            )}
            {sub}
          </p>
        )}
      </div>
      <div className="shrink-0 text-end max-sm:flex max-sm:items-baseline max-sm:gap-[0.7em]">
        <div className="num text-[2.8em] leading-none font-semibold tracking-tight max-sm:text-[1.6em]">
          <span dir="ltr">{time || "\u00a0"}</span>
        </div>
        <div className="mt-[0.45em] text-[1em] leading-normal text-white/55 max-sm:mt-0">{date}</div>
      </div>
    </header>
  );
}

/** القلب: الرقم الحالي عملاقاً في البداية، والحالة (تفضّل بالدخول…) على الجانب. */
function Now({ lang, v }: { lang: Lang; v: LayoutProps["v"] }) {
  const n = v.currentNumber;
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-[1.4em] py-[1.4em] portrait:justify-center landscape:flex-row landscape:gap-[2.5em]">
      <div className="flex min-w-0 flex-col justify-between gap-[0.8em] landscape:flex-1">
        <Label>{t(lang, "displayNow")}</Label>
        <div
          key={n ?? "none"}
          data-testid="display-number"
          className={`${GIANT} ${n === null ? "font-thin text-white/25" : "font-bold text-white"} ${RISE} ${sized("hero", n)}`}
        >
          {/* قبل بدء الاستقبال: شرطة رفيعة أصغر — علامة انتظار لا كتلة رمادية */}
          {n ?? <span className="relative -top-[0.3em] text-[0.6em]">—</span>}
        </div>
      </div>

      {/* بالعرض: عمود على الهامش الأخير (كالساعة فوقه). بالطول يذوب (contents) فيصعد زرّ الصوت وتنزل الحالة تحت الرقم */}
      <aside className="flex flex-col gap-[1.2em] portrait:contents landscape:w-[28%] landscape:text-end">
        <div className="empty:hidden portrait:order-first">
          <SoundGate lang={lang} tone="dark" />
        </div>
        <div className="landscape:mt-auto">
          <p className={`leading-normal font-bold text-balance ${n !== null ? "text-[2.6em]" : "text-[2em] text-white/80"}`}>
            {n !== null ? t(lang, "dp_enter") : t(lang, "dp_soon")}
          </p>
          {v.blocker && (
            <p className="mt-[0.8em] flex items-start gap-[0.5em] text-[1em] leading-normal text-white/65 landscape:justify-end">
              <CircleAlert aria-hidden className="mt-[0.25em] size-[1.05em] shrink-0 text-brand-300" />
              {errorText(lang, v.blocker)}
            </p>
          )}
        </div>
      </aside>
    </section>
  );
}

/** خانة جدول: تسمية في الأعلى وقيمة كبيرة تحتها. */
function Cell({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`flex min-w-0 flex-col justify-between gap-[0.9em] ${RULE} ${className}`}>
      <Label mark="bg-white/30" className="text-[0.9em] text-white/55">
        {label}
      </Label>
      {children}
    </div>
  );
}

/** الشريط السفلي: الأرقام القادمة، عدد المنتظرين، مدّة الكشف، ورمز QR. */
function Band({ lang, v, qr }: { lang: Lang; v: LayoutProps["v"]; qr: string }) {
  // «{n} د» / «{n} min» → الوحدة وحدها، تُكتب صغيرة بجانب الرقم
  const unit = t(lang, "dp_min", { n: "" }).trim();
  return (
    <section className="grid grid-cols-2 gap-x-[2em] gap-y-[1.4em] py-[1.3em] landscape:grid-cols-[minmax(max-content,1fr)_auto_auto_auto] landscape:gap-0">
      <Cell label={t(lang, "dp_upcoming")} className="col-span-2 landscape:col-span-1 landscape:pe-[2.5em]">
        {v.nextNumbers.length > 0 ? (
          <div className="flex flex-wrap gap-[0.7em]">
            {v.nextNumbers.map((x, i) => (
              <span
                key={x}
                className={`num inline-flex h-[1.5em] min-w-[1.9em] items-center justify-center rounded-[0.12em] px-[0.3em] text-[3em] leading-none font-bold ${
                  i === 0 ? "bg-brand-600 text-white" : "text-white ring-2 ring-white/20 ring-inset"
                }`}
              >
                {x}
              </span>
            ))}
          </div>
        ) : (
          <p className="flex h-[3.46em] items-center text-[1.3em] leading-normal text-white/55">{t(lang, "emptyQueue")}</p>
        )}
      </Cell>

      <Cell label={t(lang, "waitingCount")} className="portrait:border-t portrait:pt-[1.4em] landscape:border-s landscape:px-[2.5em]">
        <span className="num text-[3.4em] leading-none font-semibold">{v.waiting}</span>
      </Cell>

      <Cell label={t(lang, "dp_avg")} className="portrait:border-t portrait:pt-[1.4em] landscape:border-s landscape:px-[2.5em]">
        <span className="whitespace-nowrap">
          <span className="num text-[3.4em] leading-none font-semibold">{v.avgServiceMin}</span>
          <span className="ms-[0.35em] text-[1.3em] text-white/55">{unit}</span>
        </span>
      </Cell>

      <div className={`col-span-2 flex items-center gap-[1.3em] portrait:border-t portrait:pt-[1.4em] landscape:col-span-1 landscape:border-s landscape:ps-[2.5em] ${RULE}`}>
        <div
          className="w-[6.6em] shrink-0 rounded-[0.35em] bg-white p-[0.45em] [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: qr }}
        />
        <div className="min-w-0 landscape:max-w-[16em]">
          {/* مسافة غير منكسرة قبل الشرطة كي لا تبدأ بها السطر الثاني */}
          <p className="text-[1.15em] leading-normal font-bold text-balance">{t(lang, "posterTitle").replace(" —", "\u00a0—")}</p>
          <p className="mt-[0.3em] text-[0.9em] leading-normal text-pretty text-white/55">{t(lang, "dp_scan")}</p>
        </div>
      </div>
    </section>
  );
}

/** النداء: الشاشة تنقلب إلى لون العيادة والرقم بأكبر حجم، وشريط داكن بالتعليمة والطبيب. */
function Callout({ lang, n, doctor, onClose }: { lang: Lang; n: number; doctor: string | null; onClose: () => void }) {
  return (
    <div role="alert" onClick={onClose} className="fixed inset-0 z-50 flex cursor-pointer flex-col bg-brand-600 text-white">
      <div className={`flex min-h-0 flex-1 flex-col pt-[2.2em] ${GUTTER}`}>
        <Label mark="bg-white" className="text-[1.4em] text-white/90">
          {t(lang, "dp_number")}
        </Label>
        <div className="flex flex-1 items-center">
          <div key={n} className={`${GIANT} font-bold ${RISE} ${sized("call", n)}`}>
            {n}
          </div>
        </div>
      </div>
      <div className={`flex flex-wrap items-center justify-between gap-x-[2em] gap-y-[0.4em] py-[1.8em] text-white ${INK} ${GUTTER}`}>
        <p className="text-[3.2em] leading-normal font-bold">{t(lang, "dp_enter")}</p>
        {doctor && (
          <p className="flex items-center gap-[0.5em] text-[1.8em] leading-normal font-semibold text-white/80">
            <Stethoscope aria-hidden className="size-[1em] shrink-0 text-brand-300" />
            {doctor}
          </p>
        )}
      </div>
    </div>
  );
}

function FocusLayout({ lang, v, doctor, time, date, qr, callout, dismissCallout, voice, toggleVoice }: LayoutProps) {
  const n = v.currentNumber;
  return (
    <main className={`relative flex min-h-dvh flex-col overflow-hidden text-white ${INK} ${UNIT}`}>
      <div className={`flex flex-1 flex-col ${GUTTER}`}>
        <Masthead v={v} doctor={doctor} time={time} date={date} />
        <Now lang={lang} v={v} />
        {/* اللمسة الوحيدة الجريئة: خطّ بلون العيادة يُمسح من جديد مع كلّ رقم */}
        <div aria-hidden key={`rule-${n ?? "none"}`} className={`h-[0.5em] shrink-0 bg-brand-500 ltr:origin-left rtl:origin-right ${WIPE}`} />
        <Band lang={lang} v={v} qr={qr} />
        <footer className={`flex flex-wrap items-center justify-between gap-x-[2em] gap-y-[0.6em] border-t py-[0.75em] ${RULE}`}>
          <p className="flex items-center gap-[0.6em] text-[max(0.8em,12px)] leading-normal text-white/40">
            <LogoMark size={18} className="shrink-0" />
            {t(lang, "dp_footer")}
          </p>
          <Controls
            lang={lang}
            voice={voice}
            toggleVoice={toggleVoice}
            tone="dark"
            className="text-white/70 opacity-70 transition-opacity focus-within:opacity-100 hover:opacity-100"
          />
        </footer>
      </div>

      {callout !== null && <Callout lang={lang} n={callout} doctor={doctor} onClose={dismissCallout} />}
    </main>
  );
}

/** مصغّر: شبه أسود، رقم أبيض عملاق في البداية، خطّ ملوّن، ومربّعات الأرقام القادمة + QR. */
function FocusThumb() {
  return (
    <div aria-hidden className={`@container relative flex aspect-video w-full flex-col overflow-hidden rounded-xl px-[6%] py-[4.5%] ${INK}`}>
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-[1.6cqw]">
          <span className="h-[2.6cqw] w-[30cqw] rounded-full bg-white/85" />
          <span className="h-[1.8cqw] w-[19cqw] rounded-full bg-brand-300/80" />
        </div>
        <span className="h-[3.4cqw] w-[12cqw] rounded-full bg-white/70" />
      </div>
      <div className="mt-[3cqw] h-px shrink-0 bg-white/15" />
      <div className="flex min-h-0 flex-1 items-end justify-between gap-[3cqw] pb-[2.2cqw]">
        <span className="num text-[31cqw] leading-[0.8] font-bold tracking-[-0.03em] text-white">42</span>
        <span className="mb-[0.5cqw] h-[2.6cqw] w-[20cqw] rounded-full bg-white/55" />
      </div>
      <div className="h-[1.5cqw] shrink-0 bg-brand-500" />
      <div className="mt-[3cqw] flex items-center gap-[1.8cqw]">
        <span className="num flex h-[8cqw] w-[11cqw] items-center justify-center rounded-[0.8cqw] bg-brand-600 text-[4.6cqw] font-bold text-white">43</span>
        <span className="num flex h-[8cqw] w-[11cqw] items-center justify-center rounded-[0.8cqw] text-[4.6cqw] font-bold text-white/85 ring-1 ring-white/30 ring-inset">
          44
        </span>
        <span className="num flex h-[8cqw] w-[11cqw] items-center justify-center rounded-[0.8cqw] text-[4.6cqw] font-bold text-white/85 ring-1 ring-white/30 ring-inset">
          45
        </span>
        <span className="ms-auto grid size-[9cqw] grid-cols-2 gap-[0.9cqw] rounded-[0.8cqw] bg-white p-[1.1cqw]">
          <span className="border-[0.75cqw] border-ink" />
          <span className="border-[0.75cqw] border-ink" />
          <span className="border-[0.75cqw] border-ink" />
          <span className="bg-[radial-gradient(#0b1b2b_45%,transparent_50%)] bg-size-[1.5cqw_1.5cqw]" />
        </span>
      </div>
    </div>
  );
}

export const focus: LayoutDef = { Layout: FocusLayout, Thumb: FocusThumb };
