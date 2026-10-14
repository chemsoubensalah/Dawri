import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, CalendarCheck2, ExternalLink, Info } from "lucide-react";
import StaffFrame from "@/components/StaffFrame";
import { Chip } from "@/components/ui";
import { ManualPaymentCard, PaymentHistory, PaymentReturnBanners, PlanCards, dateFmt, hasManualPayment } from "@/components/billing/BillingParts";
import { contactLine } from "@/lib/legal";
import type { Lang, Shop } from "@/lib/domain/types";
import { coveredByClinic, isSubscriptionActive, subscriptionStatus } from "@/lib/domain/subscription";
import { t, tn, drTitle } from "@/lib/i18n";
import { chargilyConfig, manualPayment, paymentReference, plans } from "@/lib/server/billing";
import { TRIAL_DAYS } from "@/lib/pricing";
import { now as clockNow } from "@/lib/server/clock";
import { getDb } from "@/lib/server/db";
import { getLang, ownerShop, staffRole } from "@/lib/server/http";
import { managerClinic } from "@/lib/server/clinicHttp";
import * as repo from "@/lib/server/repo";
import * as crepo from "@/lib/server/clinicsRepo";
import type { Clinic } from "@/lib/server/clinicsRepo";
import ReferralCard from "./ReferralCard";

export const metadata = { title: "الاشتراك", robots: { index: false } };

const DAY = 86_400_000;

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ paid?: string; failed?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const shop = await ownerShop(slug);
  if (!shop) redirect(`/staff/${slug}`);
  const lang = await getLang(shop.defaultLang);
  const now = clockNow();
  const db = await getDb();
  const payments = await repo.listPayments(db, shop.id);
  // عضو في عيادة متعدّدة الأطبّاء: اشتراك العيادة يغطّيه (المدير يدفع)
  const clinic = shop.clinicId ? await crepo.getClinicById(db, shop.clinicId) : null;
  const fmt = dateFmt(lang);

  const active = isSubscriptionActive(shop, now);
  const paidUntil = shop.paidUntil && shop.paidUntil > now ? shop.paidUntil : null;
  const inTrial = !paidUntil && shop.trialEndsAt > now;
  const trialDaysLeft = Math.max(0, Math.ceil((shop.trialEndsAt.getTime() - now.getTime()) / DAY));
  // مدّة تجربة هذا الحساب نفسه: 30 يوماً للجديد، أطول للمدعوّ أو للحسابات القديمة (60)
  const trialTotalDays = Math.max(TRIAL_DAYS, Math.round((shop.trialEndsAt.getTime() - shop.createdAt.getTime()) / DAY));
  const trialProgress = Math.min(1, Math.max(0, 1 - trialDaysLeft / trialTotalDays));
  const cfg = chargilyConfig();
  const ref = paymentReference("cabinet", shop.slug);

  return (
    <StaffFrame role={await staffRole(slug)} lang={lang} slug={shop.slug} name={shop.name} doctor={drTitle(lang, shop.kind, shop.profile.doctorName)} look={shop.look} active="billing">
      <div className="mx-auto max-w-4xl space-y-5">
        <h1 className="text-2xl font-bold">{t(lang, "nav_billing")}</h1>

        <PaymentReturnBanners lang={lang} paid={sp.paid} failed={sp.failed} />

        {clinic ? (
          <ClinicCoverCard lang={lang} shop={shop} clinic={clinic} now={now} active={active} isManager={Boolean(clinic && (await managerClinic(clinic.slug)))} />
        ) : (
          <>
            {/* ——— الحالة ——— */}
            <section className="card p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                    <CalendarCheck2 size={24} />
                  </span>
                  <div>
                    <div className="text-sm text-slate-500">{t(lang, "pl_cabinet")}</div>
                    <div className="text-lg font-bold">
                      {paidUntil
                        ? t(lang, "bl_activeUntil", { d: fmt.format(paidUntil) })
                        : inTrial
                          ? t(lang, "bl_trialUntil", { d: fmt.format(shop.trialEndsAt) })
                          : t(lang, "bl_expired")}
                    </div>
                  </div>
                </div>
                <Chip tone={paidUntil ? "green" : inTrial ? "violet" : "rose"}>
                  {paidUntil ? t(lang, "bl_stActive") : inTrial ? tn(lang, "bl_stTrial", trialDaysLeft) : t(lang, "bl_stExpired")}
                </Chip>
              </div>
              {inTrial && (
                <div className="mt-5">
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600" style={{ width: `${trialProgress * 100}%` }} />
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{t(lang, "bl_trialNote")}</p>
                </div>
              )}
              {!active && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{t(lang, "subscriptionExpired")}</p>}
            </section>

            {/* ——— الخطط ——— */}
            <PlanCards lang={lang} plans={plans("cabinet")} online={cfg.enabled} test={cfg.test} endpoint={`/api/staff/${shop.slug}/billing`} contact={hasManualPayment(manualPayment()) ? null : contactLine(lang)} />
          </>
        )}

        <ReferralCard lang={lang} shopId={shop.id} />

        {!clinic && <ManualPaymentCard lang={lang} manual={manualPayment()} reference={ref} waText={t(lang, "bl_waText")} />}

        {/* ——— السجلّ (مدفوعات الطبيب الخاصّة) ——— */}
        {(!clinic || payments.length > 0) && <PaymentHistory lang={lang} payments={payments} />}
      </div>
    </StaffFrame>
  );
}

/**
 * «اشتراكك مشمول باشتراك العيادة «X»» — لا أزرار دفع هنا: مدير العيادة يدفع.
 * عند مغادرة العيادة (leaveClinic / removeDoctor / إعادة ضبط الرمز) يرجع الطابور إلى اشتراكه الخاصّ فقط.
 */
function ClinicCoverCard({
  lang,
  shop,
  clinic,
  now,
  active,
  isManager,
}: {
  lang: Lang;
  shop: Shop;
  clinic: Clinic;
  now: Date;
  active: boolean;
  isManager: boolean;
}) {
  const fmt = dateFmt(lang);
  const cs = subscriptionStatus(clinic, now);
  const own = subscriptionStatus(shop, now);
  // التغطية الفعلية لهذا الطابور (تجربة العيادة لا تشمل طابوراً قديماً انضمّ إليها — repo.clinicCoverSql)
  const covers = coveredByClinic(shop, now);
  const tone = covers ? "brand" : active ? "amber" : "rose";
  const head = { brand: "bg-brand-50/60", amber: "bg-amber-50/70", rose: "bg-rose-50/70" }[tone];
  const icon = { brand: "bg-brand-600", amber: "bg-amber-500", rose: "bg-rose-600" }[tone];
  const title = covers ? "cb_coveredTitle" : cs.active ? "cb_trialNoCoverTitle" : "cb_clinicExpiredTitle";
  const sub = covers ? "cb_coveredSub" : cs.active ? "cb_trialNoCoverSub" : active ? "cb_clinicExpiredOwnSub" : "cb_clinicExpiredSub";
  return (
    <section className="card overflow-hidden p-0" data-testid="clinic-cover">
      <div className={`flex flex-wrap items-center justify-between gap-3 p-6 ${head}`}>
        <div className="flex min-w-0 items-center gap-3">
          <span className={`inline-flex size-12 shrink-0 items-center justify-center rounded-2xl text-white ${icon}`}>
            <Building2 size={24} />
          </span>
          <div className="min-w-0">
            <div className="text-sm text-slate-500">{t(lang, "cb_clinicStatus")}</div>
            <h2 className="text-lg leading-snug font-bold">{t(lang, title, { name: clinic.name })}</h2>
          </div>
        </div>
        <Chip tone={cs.paidUntil ? "green" : cs.trial ? "violet" : "rose"}>
          {cs.paidUntil
            ? t(lang, "cb_chipPaid", { d: fmt.format(cs.paidUntil) })
            : cs.trial
              ? tn(lang, "cb_chipTrial", cs.daysLeft)
              : t(lang, "cb_chipExpired")}
        </Chip>
      </div>
      <div className="space-y-3 p-6">
        <p className="text-slate-700">{t(lang, sub)}</p>
        {covers && shop.clinicUntil && (
          <p className="text-sm text-slate-500">
            {cs.paidUntil ? t(lang, "bl_activeUntil", { d: fmt.format(shop.clinicUntil) }) : t(lang, "bl_trialUntil", { d: fmt.format(shop.clinicUntil) })}
          </p>
        )}
        {covers
          ? own.paidUntil && <p className="rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-800">{t(lang, "cb_ownPaid", { d: fmt.format(own.paidUntil) })}</p>
          : own.active && <p className="rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-800">{t(lang, "cb_ownActive", { d: fmt.format(own.until) })}</p>}
        {!active && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{t(lang, "subscriptionExpired")}</p>}
        <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
          <Info size={14} className="mt-0.5 shrink-0" /> {t(lang, "cb_docLeaveNote")}
        </p>
        {isManager ? (
          <Link href={`/c/${clinic.slug}/manage/billing`} className="btn-secondary btn-sm">
            {t(lang, "cb_managerLink")} <ExternalLink size={14} />
          </Link>
        ) : (
          !covers && <p className="text-sm font-semibold text-slate-600">{t(lang, "cb_askManager")}</p>
        )}
      </div>
    </section>
  );
}
