"use client";
import type { CSSProperties, ReactNode } from "react";
import { Clock3, DoorOpen, Lock, Stethoscope, Ticket, Users } from "lucide-react";
import SoundGate from "@/components/SoundGate";
import { LogoMark } from "@/components/ui";
import type { Lang } from "@/lib/domain/types";
import { errorText, t, type DictKey } from "@/lib/i18n";
import { Controls } from "./shared";
import type { LayoutDef, LayoutProps } from "./types";

/**
 * «عمودي»: واجهة بطاقات على طريقة التطبيقات، مصمَّمة أوّلاً لتلفاز معلَّق بالطول (1080×1920).
 * التوقيع البصري: تذكرة انتظار بثقوب تمزيق (قصّ نصف دائري عبر mask) — في بطاقة الرقم وفي قائمة الأرقام القادمة.
 * بالعرض (أغلب التلفازات) يصير عمودين: الطبيب + الرقم في جهة، والقائمة + الإحصاءات + QR في الأخرى.
 */

const L = (lang: Lang, key: string, vars?: Record<string, string | number>) => t(lang, `lay_portrait_${key}` as DictKey, vars);

/* ——— أقنعة الثقوب (طبقتان كلّ منهما تغطّي نصف العنصر، فلا نحتاج mask-composite غير المدعوم في المتصفّحات القديمة) ——— */

const hole = (at: string, r: string) => `radial-gradient(circle at ${at}, transparent ${r}, #000 calc(${r} + 0.5px))`;
const masked = (m: string): CSSProperties => ({ WebkitMask: m, mask: m });

/** ثقبان في زاويتي حافّة (أعلى أو أسفل) — لنصفي التذكرة المفصولين بخطّ تمزيق أفقي. */
function edgeNotch(edge: "top" | "bottom", r: string): CSSProperties {
  const y = edge === "top" ? "0" : "100%";
  return masked(`${hole(`0 ${y}`, r)} left / 51% 100% no-repeat, ${hole(`100% ${y}`, r)} right / 51% 100% no-repeat`);
}

/** ثقبان أعلى وأسفل خطّ تمزيق عمودي على مسافة --stub من بداية السطر (يُعكس في العربية). */
function stubNotch(rtl: boolean, r: string): CSSProperties {
  const x = rtl ? "calc(100% - var(--stub))" : "var(--stub)";
  return masked(`${hole(`${x} 0`, r)} top / 100% 51% no-repeat, ${hole(`${x} 100%`, r)} bottom / 100% 51% no-repeat`);
}

/* ——— الخلفية: تدرّج اللون + شكل قُطري ناعم + أقواس متّحدة المركز (بلا blur) ——— */

const BG = "bg-[linear-gradient(160deg,var(--color-brand-700),var(--color-brand-900)_55%,var(--color-brand-950))]";

function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_45%_at_50%_0%,rgb(255_255_255/0.10),transparent_70%)]" />
      <div className="absolute -end-[35vmax] -top-[30vmax] size-[90vmax] rotate-[28deg] rounded-[28%] bg-white/[0.035]" />
      <svg viewBox="0 0 200 200" className="absolute -start-[22vmax] -bottom-[22vmax] size-[60vmax] text-white" fill="none" stroke="currentColor">
        {[96, 80, 64, 48, 32].map((r, i) => (
          <circle key={r} cx="100" cy="100" r={r} strokeOpacity={0.05 + i * 0.012} strokeWidth="0.6" />
        ))}
      </svg>
    </div>
  );
}

/* ——— الأجزاء ——— */

function Header({ v, doctor, time, date }: Pick<LayoutProps, "v" | "doctor" | "time" | "date">) {
  return (
    <header className="relative flex items-center justify-between gap-4 px-[clamp(1rem,3vw,3rem)] pt-[clamp(0.9rem,2.6vh,2.25rem)]">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <span className="shrink-0 rounded-[1.1rem] bg-white/10 p-1.5 ring-1 ring-white/15">
          <LogoMark size={44} />
        </span>
        <div className="min-w-0">
          {/* بلا اسم طبيب: اسم العيادة ينتقل إلى بطاقة الطبيب، فلا نكرّره هنا */}
          {doctor && (
            <div className="line-clamp-2 text-[clamp(1.05rem,min(2vw,3.2vh),2rem)] leading-normal font-bold">{v.name}</div>
          )}
          <div className={`text-[clamp(0.85rem,min(1.3vw,2.2vh),1.3rem)] leading-normal text-white/70 ${doctor ? "" : "font-semibold text-white/85"}`}>
            {date || " "}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2.5 rounded-2xl bg-white/10 px-4 py-2 ring-1 ring-white/15 sm:px-5">
        <Clock3 className="size-[clamp(1.1rem,2.6vh,1.8rem)] text-white/70" />
        <span className="num text-[clamp(1.6rem,min(3.6vw,5.4vh),3.6rem)] leading-tight font-bold tracking-tight" dir="ltr">
          {time || "--:--"}
        </span>
      </div>
    </header>
  );
}

function DoctorCard({ lang, v, doctor }: Pick<LayoutProps, "lang" | "v" | "doctor">) {
  return (
    <section className="flex items-center gap-[clamp(0.75rem,1.6vw,1.5rem)] rounded-[1.75rem] bg-white/10 px-[clamp(1rem,2vw,2rem)] py-[clamp(0.75rem,1.8vh,1.5rem)] ring-1 ring-white/15">
      <span className="relative inline-flex size-[clamp(3.25rem,min(6vw,8vh),6rem)] shrink-0 items-center justify-center rounded-full bg-white text-brand-700 ring-[6px] ring-white/15">
        <Stethoscope className="size-[52%]" strokeWidth={2.1} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[clamp(0.85rem,min(1.3vw,2.1vh),1.35rem)] leading-normal font-semibold text-brand-100">
          {doctor ? t(lang, "dp_doctor") : L(lang, "clinic")}
        </div>
        <div className="line-clamp-2 text-[clamp(1.45rem,5.6vw,3.6rem)] leading-[1.4] font-bold lg:landscape:text-[min(2.9vw,4.4vh)]">
          {doctor ?? v.name}
        </div>
        {v.profile.specialty && (
          <div className="line-clamp-1 text-[clamp(0.95rem,3vw,1.9rem)] leading-normal text-white/75 lg:landscape:text-[min(1.5vw,2.5vh)]">
            {v.profile.specialty}
          </div>
        )}
      </div>
    </section>
  );
}

/** بطاقة الرقم الحالي: تذكرة بيضاء من نصفين يفصلهما خطّ تمزيق بثقبين. */
function NowCard({ lang, v }: Pick<LayoutProps, "lang" | "v">) {
  const r = "clamp(0.8rem,1.8vh,1.4rem)";
  const n = v.currentNumber;
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[0.5vh] rounded-t-[2.25rem] bg-white px-6 pt-[clamp(0.75rem,2vh,1.75rem)] pb-[clamp(0.5rem,1.5vh,1.25rem)] text-center"
        style={edgeNotch("bottom", r)}
      >
        <div className="inline-flex items-center gap-2.5 rounded-full bg-brand-50 px-[1.1em] py-[0.35em] text-[clamp(1rem,min(1.7vw,2.8vh),1.9rem)] leading-normal font-bold text-brand-800 ring-1 ring-brand-100">
          <span className="relative flex size-[0.55em]">
            {n !== null ? (
              <>
                <span className="absolute inline-flex size-full rounded-full bg-brand-600 opacity-60 motion-safe:animate-ping" />
                <span className="relative inline-flex size-full rounded-full bg-brand-600" />
              </>
            ) : (
              <span className="relative inline-flex size-full rounded-full bg-slate-300" />
            )}
          </span>
          {t(lang, "displayNow")}
        </div>
        {n !== null ? (
          <div
            key={n}
            data-testid="display-number"
            className="num text-[min(40vw,19vh)] leading-[0.95] font-bold tracking-tight text-brand-700 motion-safe:animate-pop lg:landscape:text-[min(39vh,24vw)]"
            dir="ltr"
          >
            {n}
          </div>
        ) : (
          /* لا رقم بعد: تذكرة باهتة وسطر هادئ بدل «—» عملاقة تبدو كشريط معطوب */
          <div data-testid="display-number" className="flex flex-col items-center gap-[1.5vh] py-[1vh]">
            <span className="sr-only">—</span>
            <Ticket aria-hidden className="size-[min(18vh,12vw)] text-brand-200" strokeWidth={1.5} />
            <span className="text-[clamp(1.2rem,min(3vw,3.2vh),2.6rem)] leading-normal font-bold text-slate-400">{L(lang, "idle")}</span>
          </div>
        )}
      </div>
      <div
        className="flex items-center justify-center gap-3 rounded-b-[2.25rem] border-t-2 border-dashed border-slate-300 bg-white px-6 py-[clamp(0.8rem,2.4vh,1.8rem)] text-center"
        style={edgeNotch("top", r)}
      >
        {n !== null && <DoorOpen className="size-[clamp(1.4rem,3.4vh,2.4rem)] shrink-0 text-brand-700" />}
        <span className="text-[clamp(1.2rem,min(2.6vw,3.6vh),2.6rem)] leading-normal font-bold text-ink">
          {n !== null ? t(lang, "dp_enter") : t(lang, "dp_soon")}
        </span>
      </div>
    </section>
  );
}

/** الأرقام القادمة: تذاكر مكدّسة (كعب الرقم + جسم فيه الترتيب والانتظار التقريبي). */
function Upcoming({ lang, v }: Pick<LayoutProps, "lang" | "v">) {
  const rtl = lang === "ar";
  const labels = [t(lang, "db_upNext"), L(lang, "then"), L(lang, "after")];
  const r = "clamp(0.55rem,1.2vh,0.9rem)";
  const row = "[--stub:clamp(5.5rem,20vw,14rem)] lg:landscape:[--stub:min(10vw,15vh)]";
  return (
    <section className="flex flex-col gap-[clamp(0.6rem,1.4vh,1.1rem)] lg:landscape:min-h-0 lg:landscape:flex-1">
      <h2 className="flex items-center gap-2.5 text-[clamp(1.05rem,min(1.7vw,2.8vh),1.9rem)] leading-normal font-bold text-white/90">
        <Ticket className="size-[1.1em] text-brand-200" />
        {t(lang, "dp_upcoming")}
      </h2>
      {v.nextNumbers.length > 0 ? (
        <ol className="flex flex-col gap-[clamp(0.5rem,1.2vh,1rem)] lg:landscape:min-h-0 lg:landscape:flex-1">
          {v.nextNumbers.map((n, i) => {
            const first = i === 0;
            const eta = (i + 1) * v.avgServiceMin;
            return (
              <li
                key={n}
                className={`flex items-stretch rounded-[1.1rem] lg:landscape:max-h-[16vh] lg:landscape:flex-1 ${row} ${first ? "bg-white text-brand-800" : "bg-white/[0.12] text-white"}`}
                style={stubNotch(rtl, r)}
              >
                <div
                  className={`num flex w-(--stub) shrink-0 items-center justify-center py-[clamp(0.4rem,1.1vh,1rem)] text-[min(8vw,4vh)] leading-tight font-bold lg:landscape:text-[min(6.4vh,3.6vw)] ${first ? "bg-brand-50" : "bg-white/[0.05]"}`}
                  dir="ltr"
                >
                  {n}
                </div>
                <div className={`flex min-w-0 flex-1 items-center justify-between gap-3 border-s-2 border-dashed px-[clamp(0.8rem,1.6vw,1.75rem)] ${first ? "border-brand-200" : "border-white/20"}`}>
                  <span
                    className={`rounded-full px-[0.8em] py-[0.15em] text-[clamp(0.95rem,min(3vw,2.4vh),2.2rem)] leading-normal font-bold lg:landscape:text-[clamp(0.95rem,min(1.5vw,2.5vh),1.7rem)] ${first ? "bg-brand-700 text-white" : "text-white/90"}`}
                  >
                    {labels[i]}
                  </span>
                  {eta > 0 && (
                    <span className={`flex shrink-0 items-center gap-1.5 text-[clamp(0.9rem,min(2.6vw,2vh),1.9rem)] leading-normal font-semibold lg:landscape:text-[clamp(0.9rem,min(1.35vw,2.3vh),1.5rem)] ${first ? "text-slate-600" : "text-white/70"}`}>
                      <Clock3 className="size-[1em]" />
                      <span className="num">{L(lang, "eta", { n: eta })}</span>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="flex flex-col items-center justify-center gap-[1vh] rounded-[1.1rem] border-2 border-dashed border-white/20 px-5 py-[clamp(1rem,3vh,2rem)] text-center text-[clamp(1rem,min(3vw,2.4vh),2rem)] leading-normal text-white/75 lg:landscape:flex-1 lg:landscape:text-[clamp(1rem,min(1.5vw,2.5vh),1.6rem)]">
          <Ticket aria-hidden className="size-[clamp(2rem,min(8vw,6vh),4.5rem)] text-white/30" strokeWidth={1.5} />
          {t(lang, "emptyQueue")}
        </div>
      )}
    </section>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex min-w-0 items-center gap-[clamp(0.6rem,1vw,1rem)] rounded-[1.4rem] bg-white/10 px-[clamp(0.8rem,1.4vw,1.4rem)] py-[clamp(0.6rem,1.4vh,1.1rem)] ring-1 ring-white/15">
      <span className="inline-flex size-[clamp(2.4rem,min(3.4vw,5.4vh),3.6rem)] shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[clamp(0.8rem,min(2.4vw,1.9vh),1.6rem)] leading-normal font-semibold text-white/70 lg:landscape:text-[clamp(0.8rem,min(1.15vw,1.9vh),1.2rem)]">{label}</div>
        <div className="num text-[clamp(1.5rem,min(5vw,4.4vh),3.4rem)] leading-tight font-bold lg:landscape:text-[clamp(1.5rem,min(2.6vw,4.4vh),3rem)]">{value}</div>
      </div>
    </div>
  );
}

function QrCard({ lang, qr }: Pick<LayoutProps, "lang" | "qr">) {
  return (
    <section className="flex items-center gap-[clamp(0.8rem,1.4vw,1.5rem)] rounded-[1.75rem] bg-white p-[clamp(0.6rem,1.4vh,1.1rem)] text-ink">
      <div
        className="w-[clamp(100px,min(14vw,8vh),150px)] shrink-0 lg:landscape:w-[clamp(110px,15vh,180px)] rounded-xl bg-white p-1 ring-4 ring-brand-100 [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
        dangerouslySetInnerHTML={{ __html: qr }}
      />
      <div className="min-w-0">
        <div className="text-[clamp(1rem,min(3.4vw,2.4vh),2rem)] leading-normal font-bold lg:landscape:text-[clamp(1rem,min(1.45vw,2.5vh),1.65rem)]">{t(lang, "posterTitle")}</div>
        <p className="mt-1 text-[clamp(0.8rem,min(2.4vw,1.7vh),1.5rem)] leading-normal text-slate-600 lg:landscape:text-[clamp(0.8rem,min(1.05vw,1.8vh),1.15rem)]">{t(lang, "dp_scan")}</p>
      </div>
    </section>
  );
}

/** النداء: تذكرة بيضاء عملاقة تصعد من الأسفل، على خلفية اللون الكاملة (معتمة). */
function Callout({ lang, n, doctor, onClose }: { lang: Lang; n: number; doctor: string | null; onClose: () => void }) {
  const r = "clamp(1.1rem,2.6vh,2rem)";
  return (
    <div role="alert" onClick={onClose} className={`fixed inset-0 z-50 flex cursor-pointer items-center justify-center overflow-hidden p-5 ${BG}`}>
      <Backdrop />
      <div className="relative flex w-[min(92vw,62rem)] flex-col motion-safe:animate-[dw-portrait-rise_0.7s_cubic-bezier(0.2,0.9,0.3,1.12)_both]">
        <div className="flex flex-col items-center rounded-t-[2.75rem] bg-white px-6 pt-[clamp(1.25rem,4vh,3rem)] text-center" style={edgeNotch("bottom", r)}>
          <div className="rounded-full bg-brand-50 px-[1.1em] py-[0.3em] text-[clamp(1.4rem,min(3.4vw,4.6vh),3.2rem)] leading-normal font-bold text-brand-800 ring-1 ring-brand-100">
            {t(lang, "dp_number")}
          </div>
          <div className="num py-[1vh] text-[min(46vh,38vw)] leading-[0.95] font-bold tracking-tight text-brand-700" dir="ltr">
            {n}
          </div>
        </div>
        <div
          className="flex flex-col items-center gap-[1.2vh] rounded-b-[2.75rem] border-t-[3px] border-dashed border-slate-300 bg-white px-6 py-[clamp(1rem,3.4vh,2.5rem)] text-center"
          style={edgeNotch("top", r)}
        >
          <div className="flex items-center gap-3 text-[clamp(1.6rem,min(4.4vw,6vh),4.2rem)] leading-normal font-bold text-ink">
            <DoorOpen className="size-[1em] shrink-0 text-brand-700" />
            {t(lang, "dp_enter")}
          </div>
          {doctor && (
            <div className="inline-flex max-w-full items-center gap-2.5 rounded-full bg-brand-700 px-[1em] py-[0.35em] text-[clamp(1.05rem,min(2.4vw,3.4vh),2.3rem)] leading-normal font-semibold text-white">
              <Stethoscope className="size-[1em] shrink-0" />
              <span className="min-w-0">{doctor}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ——— الشاشة ——— */

function Layout({ lang, v, doctor, time, date, qr, callout, dismissCallout, voice, toggleVoice }: LayoutProps) {
  const gap = "gap-[clamp(0.75rem,1.8vh,1.5rem)]";
  return (
    <main className={`relative flex min-h-dvh flex-col overflow-hidden text-white lg:landscape:h-dvh [@media(orientation:portrait)_and_(min-width:700px)_and_(min-height:1200px)]:h-dvh ${BG}`}>
      <Backdrop />
      <Header v={v} doctor={doctor} time={time} date={date} />

      <div className="relative mx-auto w-full max-w-xl px-4 empty:hidden">
        <SoundGate lang={lang} tone="dark" />
      </div>

      <div
        className={`relative flex min-h-0 flex-1 flex-col ${gap} px-[clamp(1rem,3vw,3rem)] py-[clamp(0.75rem,2vh,1.75rem)] lg:landscape:grid lg:landscape:min-h-0 lg:landscape:grid-cols-[1.4fr_1fr] lg:landscape:gap-[clamp(1rem,2vw,2.25rem)]`}
      >
        {/* الطبيب + الرقم الحالي */}
        <div className={`flex min-h-0 flex-1 flex-col ${gap}`}>
          <DoctorCard lang={lang} v={v} doctor={doctor} />
          <NowCard lang={lang} v={v} />
        </div>

        {/* القائمة + الإحصاءات + QR */}
        <div className={`flex min-h-0 flex-col ${gap}`}>
          {v.blocker && (
            <div className="flex items-center gap-3 rounded-2xl bg-black/20 px-4 py-[clamp(0.5rem,1.2vh,0.9rem)] text-[clamp(0.95rem,min(1.35vw,2.3vh),1.4rem)] leading-normal font-semibold text-white/90 ring-1 ring-white/10">
              <Lock className="size-[1.1em] shrink-0 text-brand-200" />
              {errorText(lang, v.blocker)}
            </div>
          )}
          <Upcoming lang={lang} v={v} />
          <div className="grid grid-cols-2 gap-[clamp(0.6rem,1.2vw,1.1rem)]">
            <Stat icon={<Users className="size-[48%]" />} label={t(lang, "waitingCount")} value={v.waiting} />
            <Stat icon={<Clock3 className="size-[48%]" />} label={t(lang, "dp_avg")} value={t(lang, "dp_min", { n: v.avgServiceMin })} />
          </div>
          <QrCard lang={lang} qr={qr} />
        </div>
      </div>

      <footer className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-white/10 px-[clamp(1rem,3vw,3rem)] py-[clamp(0.5rem,1.4vh,1rem)] text-[clamp(0.75rem,min(1vw,1.7vh),1rem)] text-white/60">
        <span className="flex min-w-0 items-center gap-2 leading-normal">
          <LogoMark size={18} className="shrink-0" /> {t(lang, "dp_footer")}
        </span>
        <Controls lang={lang} voice={voice} toggleVoice={toggleVoice} tone="dark" className="opacity-60 transition-opacity hover:opacity-100 focus-within:opacity-100" />
      </footer>

      {callout !== null && <Callout lang={lang} n={callout} doctor={doctor} onClose={dismissCallout} />}
    </main>
  );
}

/* ——— المصغّر: تذكرة بيضاء كبيرة + تذاكر صغيرة مكدّسة + QR ——— */

function Thumb() {
  const r = "4px";
  return (
    <div className={`relative aspect-video w-full overflow-hidden rounded-xl p-2 ${BG}`} aria-hidden>
      <svg viewBox="0 0 100 100" className="absolute -bottom-10 -start-10 size-28 text-white" fill="none" stroke="currentColor">
        {[46, 36, 26].map((c) => (
          <circle key={c} cx="50" cy="50" r={c} strokeOpacity="0.12" strokeWidth="1.2" />
        ))}
      </svg>
      <div className="relative flex items-center justify-between">
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-[3px] bg-white/30" />
          <span className="h-1.5 w-10 rounded-full bg-white/45" />
        </span>
        <span className="h-2 w-6 rounded-full bg-white/25" />
      </div>
      <div className="relative mt-1.5 grid h-[calc(100%-1rem)] grid-cols-[1.35fr_1fr] gap-1.5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 rounded-md bg-white/15 px-1 py-0.5">
            <span className="size-2.5 rounded-full bg-white" />
            <span className="h-1 w-9 rounded-full bg-white/60" />
          </div>
          <div className="flex flex-1 flex-col">
            <div className="flex flex-1 items-center justify-center rounded-t-lg bg-white" style={edgeNotch("bottom", r)}>
              <span className="num text-[1.6rem] leading-none font-bold text-brand-700">42</span>
            </div>
            <div className="flex h-3 items-center justify-center rounded-b-lg border-t border-dashed border-slate-300 bg-white" style={edgeNotch("top", r)}>
              <span className="h-1 w-8 rounded-full bg-slate-300" />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              dir="ltr"
              className={`flex h-[18%] items-stretch rounded-[4px] [--stub:14px] ${i === 0 ? "bg-white" : "bg-white/20"}`}
              style={stubNotch(false, "2.5px")}
            >
              <span className={`w-(--stub) ${i === 0 ? "bg-brand-100" : "bg-white/10"}`} />
              <span className={`my-auto ms-1.5 h-1 w-6 rounded-full ${i === 0 ? "bg-brand-700" : "bg-white/50"}`} />
            </div>
          ))}
          <div className="mt-auto flex items-center gap-1 rounded-md bg-white p-1">
            <span className="size-5 shrink-0 rounded-[3px] bg-[repeating-linear-gradient(90deg,#0b1b2b_0_2px,transparent_2px_4px),repeating-linear-gradient(0deg,#0b1b2b_0_2px,transparent_2px_4px)] opacity-80" />
            <span className="h-1 flex-1 rounded-full bg-slate-300" />
          </div>
        </div>
      </div>
    </div>
  );
}

export const portrait: LayoutDef = { Layout, Thumb };
