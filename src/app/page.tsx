import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Building2,
  BellRing,
  CalendarCheck2,
  Check,
  Clock3,
  HeartPulse,
  LogIn,
  Plus,
  Languages,
  MonitorPlay,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Stethoscope,
  Ticket,
  UserPlus,
  UserX,
  Users,
  Wifi,
} from "lucide-react";
import LangSwitch from "@/components/LangSwitch";
import MyVisits from "@/components/MyVisits";
import { Chip, IconBubble, Logo, SectionTitle } from "@/components/ui";
import { t, type DictKey } from "@/lib/i18n";
import { getLang } from "@/lib/server/http";
import {
  MAX_DOCTORS,
  clinicPriceDzd,
  clinicPriceNumber,
  clinicYearPriceDzd,
  clinicYearPriceNumber,
  priceDzd,
  priceNumber,
  yearPriceDzd,
  yearPriceNumber,
  yearSavePct,
  TRIAL_DAYS,
} from "@/lib/pricing";
import type { Lang } from "@/lib/domain/types";

function PhoneMock({ lang }: { lang: Lang }) {
  return (
    <div className="relative mx-auto w-[270px] rounded-[2.6rem] bg-ink p-2.5 shadow-(--shadow-lift) ring-1 ring-slate-900/10">
      <div className="absolute top-3 left-1/2 h-5 w-24 -translate-x-1/2 rounded-full bg-ink" />
      <div className="overflow-hidden rounded-[2.1rem] bg-[#f5f7fa]">
        <div className="bg-gradient-to-b from-brand-600 to-brand-700 px-4 pt-9 pb-4 text-white">
          <div className="text-[11px] opacity-80">{t(lang, "l_mockClinic")}</div>
          <div className="text-xs font-semibold">{t(lang, "yourNumber")}</div>
          <div className="num text-6xl leading-none font-bold">24</div>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
            <svg width="54" height="54" viewBox="0 0 54 54" aria-hidden="true">
              <circle cx="27" cy="27" r="23" fill="none" stroke="#e2e8f0" strokeWidth="6" />
              <circle cx="27" cy="27" r="23" fill="none" stroke="#10b981" strokeWidth="6" strokeLinecap="round" strokeDasharray="144.5" strokeDashoffset="36" transform="rotate(-90 27 27)" />
              <text x="27" y="32" textAnchor="middle" fontSize="15" fontWeight="700" fill="#0b1b2b">3</text>
            </svg>
            <div>
              <div className="text-sm font-bold">{t(lang, "aheadN", { n: 3 })}</div>
              <div className="text-xs text-slate-500">{t(lang, "etaAbout", { n: 20 })}</div>
            </div>
          </div>
          <div className="animate-pulse-ring rounded-2xl bg-brand-600 p-3 text-center text-sm font-bold text-white">
            {t(lang, "comeNow")}
          </div>
          <div className="flex items-center gap-2 rounded-2xl bg-white p-3 text-xs text-slate-500 shadow-sm">
            <BellRing size={16} className="text-brand-600" /> {t(lang, "l_mockAlert")}
          </div>
        </div>
      </div>
    </div>
  );
}

const WHY: { icon: React.ReactNode; title: DictKey; body: DictKey }[] = [
  { icon: <Smartphone size={20} />, title: "why_f1", body: "why_f1b" },
  { icon: <Wifi size={20} />, title: "why_f2", body: "why_f2b" },
  { icon: <BellRing size={20} />, title: "why_f3", body: "why_f3b" },
  { icon: <MonitorPlay size={20} />, title: "why_f4", body: "why_f4b" },
  { icon: <CalendarCheck2 size={20} />, title: "why_f5", body: "why_f5b" },
  { icon: <Users size={20} />, title: "why_f6", body: "why_f6b" },
  { icon: <BarChart3 size={20} />, title: "why_f7", body: "why_f7b" },
  { icon: <ShieldCheck size={20} />, title: "why_f8", body: "why_f8b" },
];

const STEPS: { icon: React.ReactNode; title: DictKey; body: DictKey }[] = [
  { icon: <QrCode size={26} />, title: "l_step1", body: "l_step1b" },
  { icon: <Ticket size={26} />, title: "l_step2", body: "l_step2b" },
  { icon: <BellRing size={26} />, title: "l_step3", body: "l_step3b" },
];

const DOCTOR: { icon: React.ReactNode; title: DictKey; body: DictKey }[] = [
  { icon: <Users size={22} />, title: "l_doc1", body: "l_doc1b" },
  { icon: <ArrowLeft size={22} />, title: "l_doc2", body: "l_doc2b" },
  { icon: <UserX size={22} />, title: "l_doc3", body: "l_doc3b" },
  { icon: <BarChart3 size={22} />, title: "l_doc4", body: "l_doc4b" },
  { icon: <MonitorPlay size={22} />, title: "l_doc5", body: "l_doc5b" },
  { icon: <UserPlus size={22} />, title: "l_doc6", body: "l_doc6b" },
];

const PATIENT: DictKey[] = ["l_pat1", "l_pat2", "l_pat3", "l_pat4", "l_pat5"];

const NOSHOW: { icon: React.ReactNode; title: DictKey; body: DictKey }[] = [
  { icon: <CalendarCheck2 size={20} />, title: "l_ns1", body: "l_ns1b" },
  { icon: <QrCode size={20} />, title: "l_ns2", body: "l_ns2b" },
  { icon: <Clock3 size={20} />, title: "l_ns3", body: "l_ns3b" },
  { icon: <UserX size={20} />, title: "l_ns4", body: "l_ns4b" },
  { icon: <ShieldCheck size={20} />, title: "l_ns5", body: "l_ns5b" },
];

const FAQ: [DictKey, DictKey][] = [
  ["l_q1", "l_a1"],
  ["l_q2", "l_a2"],
  ["l_q3", "l_a3"],
  ["l_q4", "l_a4"],
  ["l_q5", "l_a5"],
  ["l_q6", "l_a6"],
];

const PLAN: DictKey[] = ["l_plan1", "l_plan2", "l_plan3", "l_plan4", "l_plan5", "l_plan6"];
const CLINIC_PLAN: DictKey[] = ["pl_clinic1", "pl_clinic2", "pl_clinic3", "pl_clinic4"];

export default async function Home() {
  const lang = await getLang();
  const Arrow = lang === "ar" ? ArrowLeft : ArrowRight;
  const showDemo = !process.env.DATABASE_URL;
  const price = priceDzd();
  const yearPrice = yearPriceDzd();
  const clinicPrice = clinicPriceDzd();
  const clinicYearPrice = clinicYearPriceDzd();
  const savePct = yearSavePct(priceNumber(), yearPriceNumber());
  const clinicSavePct = yearSavePct(clinicPriceNumber(), clinicYearPriceNumber());

  return (
    <div className="bg-mesh min-h-dvh">
      {/* ——— الشريط العلوي ——— */}
      <header className="sticky top-0 z-30 border-b border-slate-200/60 bg-white/75 backdrop-blur-md">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" aria-label="Dawri">
            <Logo size={34} />
          </Link>
          <div className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            <a href="#how" className="hover:text-ink">{t(lang, "l_navHow")}</a>
            <a href="#doctors" className="hover:text-ink">{t(lang, "l_navDoctors")}</a>
            <a href="#why" className="hover:text-ink">{t(lang, "why_nav")}</a>
            <a href="#pricing" className="hover:text-ink">{t(lang, "l_navPricing")}</a>
            <a href="#faq" className="hover:text-ink">{t(lang, "l_navFaq")}</a>
          </div>
          <div className="flex items-center gap-2">
            <LangSwitch lang={lang} />
            {/* زرّ الدخول ظاهر دائماً (بنصّ) — على الهاتف يأخذ مكان «ابدأ مجّاناً» الموجود أصلاً في أعلى الصفحة */}
            <Link href="/login" className="btn-secondary btn-sm gap-1.5" data-testid="home-login">
              <LogIn size={16} className="rtl:-scale-x-100" /> <span className="sm:hidden">{t(lang, "l_loginShort")}</span>
              <span className="hidden sm:inline">{t(lang, "l_login")}</span>
            </Link>
            <Link href="/new" className="btn-primary btn-sm hidden sm:inline-flex">{t(lang, "l_startFree")}</Link>
          </div>
        </nav>
      </header>

      <main>
        {/* مريض عاد إلى الموقع: رقمه أو موعده أوّلاً */}
        <MyVisits lang={lang} className="mx-auto max-w-6xl px-4 pt-6" />
        {/* ——— البطل ——— */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-16 md:grid-cols-[1.15fr_1fr] md:pt-20">
          <div className="animate-fade-up">
            <Chip tone="green" className="mb-5 text-sm">
              <HeartPulse size={14} /> {t(lang, "l_eyebrow")}
            </Chip>
            <h1 className="text-4xl leading-[1.15] font-bold tracking-tight text-ink sm:text-5xl md:text-[3.4rem]">
              {t(lang, "l_heroTitle")}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">{t(lang, "l_heroSub")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/new" className="btn-primary w-full px-7 text-lg sm:w-auto">
                {t(lang, "l_ctaStart")} <Arrow size={20} />
              </Link>
              {showDemo ? (
                <Link href="/s/demo" className="btn-secondary w-full px-6 text-lg sm:w-auto">{t(lang, "homeDemo")}</Link>
              ) : (
                <a href="#how" className="btn-secondary w-full px-6 text-lg sm:w-auto">{t(lang, "l_ctaHow")}</a>
              )}
            </div>
            <p className="mt-4 text-sm text-slate-600">
              {t(lang, "l_haveAccount")}{" "}
              <Link href="/login" className="inline-flex items-center gap-1 font-semibold text-brand-700 underline underline-offset-4 hover:text-brand-800">
                {t(lang, "l_loginCta")} <Arrow size={14} />
              </Link>
            </p>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-slate-600">
              {(["l_trust1", "l_trust2", "l_trust3"] as DictKey[]).map((k, i) => (
                <li key={k} className="flex items-center gap-1.5">
                  {[<Smartphone key="a" size={16} />, <Wifi key="b" size={16} />, <Languages key="c" size={16} />][i]}
                  {t(lang, k)}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative">
            <div className="absolute inset-x-6 top-10 -z-10 h-72 rounded-full bg-brand-300/30 blur-3xl" />
            <PhoneMock lang={lang} />
            <div className="absolute -bottom-10 hidden w-56 rounded-2xl bg-white p-3 shadow-(--shadow-lift) ring-1 ring-slate-200 sm:block ltr:-left-2 rtl:-right-2">
              <div className="text-xs text-slate-500">{t(lang, "l_mockStaff")}</div>
              <div className="mt-1 flex items-center justify-between">
                <span className="num text-3xl font-bold">23</span>
                <span className="btn-primary btn-sm pointer-events-none">{t(lang, "next")}</span>
              </div>
            </div>
          </div>
        </section>

        {/* ——— كيف يعمل ——— */}
        <section id="how" className="scroll-mt-20 border-y border-slate-200/70 bg-white py-16">
          <div className="mx-auto max-w-6xl px-4">
            <SectionTitle center eyebrow={t(lang, "l_howEyebrow")} title={t(lang, "l_howTitle")} sub={t(lang, "l_howSub")} />
            <ol className="mt-12 grid gap-5 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="card relative">
                  <span className="num absolute top-5 text-5xl font-bold text-brand-100 ltr:right-5 rtl:left-5">{i + 1}</span>
                  <IconBubble size="lg">{s.icon}</IconBubble>
                  <h3 className="mt-4 text-lg font-bold">{t(lang, s.title)}</h3>
                  <p className="mt-1.5 leading-relaxed text-slate-600">{t(lang, s.body)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ——— للأطبّاء ——— */}
        <section id="doctors" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
          <SectionTitle eyebrow={t(lang, "l_docEyebrow")} title={t(lang, "l_docTitle")} sub={t(lang, "l_docSub")} />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DOCTOR.map((f) => (
              <div key={f.title} className="card flex gap-4 transition hover:-translate-y-0.5 hover:shadow-(--shadow-lift) sm:block">
                <IconBubble>{f.icon}</IconBubble>
                <div>
                  <h3 className="font-bold sm:mt-4">{t(lang, f.title)}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{t(lang, f.body)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ——— للمرضى + الغياب ——— */}
        <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-16 lg:grid-cols-2">
          <div className="card bg-gradient-to-br from-brand-700 to-brand-900 p-7 text-white ring-0">
            <Sparkles className="text-brand-200" />
            <h2 className="mt-3 text-2xl font-bold">{t(lang, "l_patTitle")}</h2>
            <p className="mt-2 text-brand-100">{t(lang, "l_patSub")}</p>
            <ul className="mt-6 space-y-3">
              {PATIENT.map((k) => (
                <li key={k} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-white/15">
                    <Check size={15} />
                  </span>
                  <span>{t(lang, k)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-7">
            <h2 className="text-2xl font-bold">{t(lang, "l_nsTitle")}</h2>
            <p className="mt-2 text-slate-600">{t(lang, "l_nsSub")}</p>
            <ul className="mt-6 space-y-4">
              {NOSHOW.map((n) => (
                <li key={n.title} className="flex gap-3">
                  <IconBubble tone="amber">{n.icon}</IconBubble>
                  <div>
                    <div className="font-bold">{t(lang, n.title)}</div>
                    <div className="text-sm text-slate-600">{t(lang, n.body)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ——— لماذا دوري؟ ——— */}
        <section id="why" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-16" data-testid="why">
          <SectionTitle center eyebrow={t(lang, "why_eyebrow")} title={t(lang, "why_title")} sub={t(lang, "why_sub")} />
          <div className="mt-10 grid grid-cols-2 gap-3 rounded-[2rem] bg-ink p-5 text-center text-white sm:grid-cols-4 sm:p-7">
            {[
              ["0", "why_st1"],
              [String(TRIAL_DAYS), "why_st2"],
              [String(priceNumber()), "why_st3"],
              ["ع + Fr", "why_st4"],
            ].map(([v, k]) => (
              <div key={k}>
                <div className="num text-3xl font-bold text-brand-300 sm:text-4xl" dir="ltr">{v}</div>
                <div className="mt-1 text-sm text-slate-300">{t(lang, k as DictKey)}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WHY.map((f) => (
              <div key={f.title} className="card flex gap-4 transition hover:-translate-y-0.5 hover:shadow-(--shadow-lift) sm:block">
                <IconBubble>{f.icon}</IconBubble>
                <div>
                  <h3 className="font-bold sm:mt-4">{t(lang, f.title)}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{t(lang, f.body)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ——— السعر ——— */}
        <section id="pricing" className="scroll-mt-20 border-y border-slate-200/70 bg-white py-16">
          <div className="mx-auto max-w-6xl px-4">
            <SectionTitle center eyebrow={t(lang, "l_priceEyebrow")} title={t(lang, "l_priceTitle")} sub={t(lang, "l_priceSub")} />
            <div className="mx-auto mt-10 grid max-w-5xl items-stretch gap-5 md:grid-cols-2">
              {/* Cabinet — طبيب واحد */}
              <div className="flex flex-col rounded-[2rem] bg-white p-7 ring-1 ring-slate-200" data-testid="plan-cabinet">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-bold">
                    <Stethoscope size={20} className="text-brand-600" /> {t(lang, "pl_cabinet")}
                  </span>
                  <Chip tone="green">{t(lang, "l_planTrial")}</Chip>
                </div>
                <p className="mt-1 text-sm text-slate-500">{t(lang, "pl_cabinetSub")}</p>
                <div className="mt-5 flex items-end gap-2">
                  <span className="num text-5xl font-bold tracking-tight" dir="ltr">{price}</span>
                  <span className="mb-1.5 text-slate-500">{t(lang, "l_perMonth")}</span>
                </div>
                <p className="mt-2 rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-800">
                  {t(lang, "l_orYear")}
                  <span className="num" dir="ltr">{yearPrice}</span> {t(lang, "l_perYear")}
                  {savePct > 0 && <span className="num mx-1.5 inline-block rounded-full bg-brand-600 px-2 py-0.5 text-xs text-white" dir="ltr">−{savePct}%</span>}
                </p>
                <p className="mt-2 text-sm text-slate-500">{t(lang, "l_noCommission")}</p>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {PLAN.map((k) => (
                    <li key={k} className="flex items-start gap-2.5 text-slate-700">
                      <Check size={18} className="mt-0.5 shrink-0 text-brand-600" /> {t(lang, k)}
                    </li>
                  ))}
                </ul>
                <Link href="/new" className="btn-secondary mt-7 w-full text-lg">{t(lang, "l_ctaStart")}</Link>
              </div>

              {/* Clinique — عدّة أطبّاء، اشتراك واحد */}
              <div className="relative rounded-[2rem] bg-ink p-1.5 shadow-(--shadow-lift)" data-testid="plan-clinic">
                <span className="absolute -top-3 z-10 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white ltr:right-6 rtl:left-6">
                  {t(lang, "pl_clinicBadge")}
                </span>
                <div className="flex h-full flex-col rounded-[1.6rem] bg-white p-7">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-bold">
                      <Building2 size={20} className="text-brand-600" /> {t(lang, "pl_clinic")}
                    </span>
                    <Chip tone="green">{t(lang, "l_planTrial")}</Chip>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{t(lang, "pl_clinicSub")}</p>
                  <div className="mt-5 flex items-end gap-2">
                    <span className="num text-5xl font-bold tracking-tight" dir="ltr">{clinicPrice}</span>
                    <span className="mb-1.5 text-slate-500">{t(lang, "l_perMonth")}</span>
                  </div>
                  <p className="mt-2 rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-800">
                    {t(lang, "l_orYear")}
                    <span className="num" dir="ltr">{clinicYearPrice}</span> {t(lang, "l_perYear")}
                    {clinicSavePct > 0 && <span className="num mx-1.5 inline-block rounded-full bg-brand-600 px-2 py-0.5 text-xs text-white" dir="ltr">−{clinicSavePct}%</span>}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">{t(lang, "l_noCommission")}</p>
                  <p className="mt-6 text-sm font-semibold text-slate-500">{t(lang, "pl_clinicPlus")}</p>
                  <ul className="mt-2.5 flex-1 space-y-2.5">
                    {CLINIC_PLAN.map((k) => (
                      <li key={k} className="flex items-start gap-2.5 text-slate-700">
                        <Check size={18} className="mt-0.5 shrink-0 text-brand-600" /> {t(lang, k, { max: MAX_DOCTORS })}
                      </li>
                    ))}
                  </ul>
                  <Link href="/new?type=clinic" className="btn-primary mt-7 w-full text-lg">{t(lang, "pl_clinicCta")}</Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ——— الأسئلة ——— */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-16">
          <SectionTitle center title={t(lang, "l_faqTitle")} />
          <div className="mt-8 space-y-3">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group card p-0 open:shadow-(--shadow-lift)">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-semibold">
                  {t(lang, q)}
                  <Plus size={20} className="shrink-0 text-brand-600 transition group-open:rotate-45" />
                </summary>
                <p className="px-5 pb-5 leading-relaxed text-slate-600">{t(lang, a)}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ——— دعوة أخيرة ——— */}
        <section className="mx-auto max-w-6xl px-4 pb-16">
          <div className="relative overflow-hidden rounded-[2rem] bg-ink px-6 py-12 text-center text-white sm:px-12">
            <div className="absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-brand-500/25 blur-3xl" />
            <h2 className="relative text-3xl font-bold">{t(lang, "l_finalTitle")}</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-slate-300">{t(lang, "l_finalSub")}</p>
            <Link href="/new" className="btn-primary relative mt-7 px-8 text-lg">
              {t(lang, "l_ctaStart")} <Arrow size={20} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200/70 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row">
          <Logo size={28} sub={false} />
          <p>{t(lang, "privacy")}</p>
          <div className="flex flex-wrap justify-center gap-x-4">
            <Link href="/doctors" className="py-2 hover:text-ink">{t(lang, "rv_dirLink")}</Link>
            <Link href="/privacy" className="py-2 hover:text-ink">{t(lang, "lg_privacy")}</Link>
            <Link href="/terms" className="py-2 hover:text-ink">{t(lang, "lg_terms")}</Link>
            <Link href="/login" className="py-2 hover:text-ink">{t(lang, "l_login")}</Link>
            <Link href="/new" className="py-2 hover:text-ink">{t(lang, "l_startFree")}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
