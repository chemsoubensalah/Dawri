import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, Check, Users } from "lucide-react";
import LangSwitch from "@/components/LangSwitch";
import { Chip, LogoMark } from "@/components/ui";
import { ManualPaymentCard, PaymentHistory, PaymentReturnBanners, PlanCards, dateFmt, hasManualPayment } from "@/components/billing/BillingParts";
import { contactLine } from "@/lib/legal";
import type { DictKey } from "@/lib/i18n";
import { dirOf, t, tn } from "@/lib/i18n";
import { themeVars } from "@/lib/theme";
import { TRIAL_DAYS } from "@/lib/pricing";
import { chargilyConfig, manualPayment, paymentReference, plans } from "@/lib/server/billing";
import { clinicBySlug, managerClinic } from "@/lib/server/clinicHttp";
import { MAX_DOCTORS, clinicSubscription } from "@/lib/server/clinics";
import * as crepo from "@/lib/server/clinicsRepo";
import { now as clockNow } from "@/lib/server/clock";
import { getDb } from "@/lib/server/db";
import { getLang } from "@/lib/server/http";

export const metadata = { title: "اشتراك العيادة", robots: { index: false } };

const INCLUDED: DictKey[] = ["cb_inc1", "cb_inc2", "cb_inc3", "cb_inc4"];

/** اشتراك العيادة متعدّدة الأطبّاء (مدير العيادة فقط): اشتراك واحد يغطّي كلّ الأطبّاء. */
export default async function ClinicBillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ paid?: string; failed?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const clinic = await managerClinic(slug);
  if (!clinic) {
    if (!(await clinicBySlug(slug))) notFound();
    redirect(`/c/${slug.toLowerCase()}/manage`);
  }
  const lang = await getLang();
  const now = clockNow();
  const db = await getDb();
  const [payments, doctors] = await Promise.all([crepo.listClinicPayments(db, clinic.id), crepo.listClinicShops(db, clinic.id)]);
  const sub = clinicSubscription(clinic, now);
  const fmt = dateFmt(lang);
  const cfg = chargilyConfig();
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;
  // مدّة تجربة هذه العيادة نفسها: 30 يوماً للجديدة، 60 للعيادات القديمة (الهجرة 014)
  const trialTotalDays = Math.max(TRIAL_DAYS, Math.round((clinic.trialEndsAt.getTime() - clinic.createdAt.getTime()) / 86_400_000));
  const trialProgress = Math.min(1, Math.max(0, 1 - sub.daysLeft / trialTotalDays));
  const ref = paymentReference("clinic", clinic.slug);

  return (
    <div className="min-h-dvh bg-[#f3f5f8]" dir={dirOf(lang)} lang={lang} style={themeVars(clinic.look)}>
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-3 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <LogoMark size={34} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-bold text-ink">{clinic.name}</span>
              <span className="block text-xs text-slate-500">{t(lang, "cl_roleManager")}</span>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LangSwitch lang={lang} className="hidden sm:inline-flex" />
            <Link href={`/c/${clinic.slug}/manage`} className="btn-ghost btn-sm">
              <Back size={16} /> {t(lang, "cb_back")}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-5 px-3 py-5 sm:px-5 sm:py-7">
        <div>
          <h1 className="text-2xl font-bold">{t(lang, "cb_title")}</h1>
          <p className="text-sm text-slate-600">{t(lang, "cb_sub")}</p>
        </div>

        <PaymentReturnBanners lang={lang} paid={sp.paid} failed={sp.failed} />

        {/* ——— الحالة ——— */}
        <section className="card p-6" data-testid="clinic-subscription">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                <Building2 size={24} />
              </span>
              <div>
                <div className="text-sm text-slate-500">{t(lang, "cb_planName")}</div>
                <div className="text-lg font-bold">
                  {sub.paidUntil
                    ? t(lang, "bl_activeUntil", { d: fmt.format(new Date(sub.until)) })
                    : sub.trial
                      ? t(lang, "bl_trialUntil", { d: fmt.format(new Date(sub.trialEndsAt)) })
                      : t(lang, "bl_expired")}
                </div>
              </div>
            </div>
            <Chip tone={sub.paidUntil ? "green" : sub.trial ? "violet" : "rose"}>
              {sub.paidUntil
                ? t(lang, "cb_chipPaid", { d: fmt.format(new Date(sub.paidUntil)) })
                : sub.trial
                  ? tn(lang, "cb_chipTrial", sub.daysLeft)
                  : t(lang, "cb_chipExpired")}
            </Chip>
          </div>
          {sub.trial && (
            <div className="mt-5">
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600" style={{ width: `${trialProgress * 100}%` }} />
              </div>
              <p className="mt-2 text-sm text-slate-500">{t(lang, "cb_trialNote")}</p>
            </div>
          )}
          {!sub.active && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{t(lang, "cb_expiredNote")}</p>}
          <p className="mt-4 flex items-center gap-2 text-sm text-slate-600">
            <Users size={16} className="text-brand-600" />
            <span className="num">{t(lang, "cb_doctors", { n: doctors.length, max: MAX_DOCTORS })}</span>
          </p>
        </section>

        {/* ——— ما يشمله ——— */}
        <section className="card p-6">
          <h2 className="text-lg font-bold">{t(lang, "cb_included")}</h2>
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {INCLUDED.map((k) => (
              <li key={k} className="flex items-center gap-2.5 text-slate-700">
                <Check size={18} className="shrink-0 text-brand-600" /> {t(lang, k, { max: MAX_DOCTORS })}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">{t(lang, "cb_leaveNote")}</p>
        </section>

        {/* ——— الخطط ——— */}
        <PlanCards lang={lang} plans={plans("clinic")} online={cfg.enabled} test={cfg.test} endpoint={`/api/c/${clinic.slug}/billing`} contact={hasManualPayment(manualPayment()) ? null : contactLine(lang)} />

        <ManualPaymentCard lang={lang} manual={manualPayment()} reference={ref} waText={t(lang, "cb_waText")} />

        <PaymentHistory lang={lang} payments={payments} />
      </main>
    </div>
  );
}
