/**
 * أجزاء صفحة الاشتراك المشتركة بين الطبيب الواحد (/staff/[slug]/billing)
 * والعيادة متعدّدة الأطبّاء (/c/[slug]/manage/billing): الخطط، التحويل اليدوي، السجلّ.
 */
import type { ReactNode } from "react";
import { CheckCircle2, CreditCard, Landmark, MessageCircle, ShieldCheck, XCircle } from "lucide-react";
import { Chip } from "@/components/ui";
import type { Lang } from "@/lib/domain/types";
import { t } from "@/lib/i18n";
import { yearSavePct } from "@/lib/pricing";
import type { Payment } from "@/lib/server/repo";
import PayButton from "./PayButton";

/** عزل اتّجاه المبلغ (LRI…PDI) كي لا ينقلب داخل جملة عربية */
export const money = (n: number) => `⁦${n.toLocaleString("fr-FR").replace(/[  ]/g, " ")} DA⁩`;

export function dateFmt(lang: Lang) {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ" : "fr-DZ", { day: "numeric", month: "long", year: "numeric", numberingSystem: "latn" });
}

export function PaymentReturnBanners({ lang, paid, failed }: { lang: Lang; paid?: string; failed?: string }) {
  return (
    <>
      {paid && (
        <div className="flex items-center gap-3 rounded-2xl bg-brand-50 p-4 font-semibold text-brand-800 ring-1 ring-brand-200">
          <CheckCircle2 size={20} /> {t(lang, "bl_thanks")}
        </div>
      )}
      {failed && (
        <div className="flex items-center gap-3 rounded-2xl bg-rose-50 p-4 font-semibold text-rose-800 ring-1 ring-rose-200">
          <XCircle size={20} /> {t(lang, "bl_failed")}
        </div>
      )}
    </>
  );
}

/** بطاقتا الشهري/السنوي + زرّ الدفع (أو «قريباً» إن لم يُضبط Chargily). */
export function PlanCards({
  lang,
  plans,
  online,
  test,
  endpoint,
  footer,
  contact,
}: {
  lang: Lang;
  plans: { months: number; amount: number }[];
  online: boolean;
  test: boolean;
  endpoint: string;
  footer?: ReactNode;
  /** لا تحويل يدوي مضبوط (hasManualPayment = false): جهة اتّصال بدل «استعمل التحويل أدناه» */
  contact?: string | null;
}) {
  const monthly = plans.find((p) => p.months === 1)?.amount ?? 0;
  return (
    <>
      <section className="grid gap-4 md:grid-cols-2">
        {plans.map((p) => {
          const save = p.months === 12 && monthly ? yearSavePct(monthly, p.amount) : 0;
          return (
            <div key={p.months} className={`card relative p-6 ${p.months === 12 ? "ring-2 ring-brand-500" : ""}`}>
              {p.months === 12 && (
                <span className="absolute -top-3 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white ltr:right-5 rtl:left-5">
                  {t(lang, "bl_bestValue")}
                </span>
              )}
              <div className="flex items-center gap-2 font-bold">
                {p.months === 1 ? t(lang, "bl_monthly") : t(lang, "bl_yearly")}
                {save > 0 && (
                  <span className="num rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700 ring-1 ring-brand-200" dir="ltr">
                    {t(lang, "pl_save", { p: save })}
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-end gap-2">
                <span className="num text-4xl font-bold" dir="ltr">{money(p.amount)}</span>
                <span className="mb-1 text-sm text-slate-500">{p.months === 1 ? t(lang, "l_perMonth") : t(lang, "bl_perYear")}</span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {p.months === 12 ? t(lang, "bl_yearlyNote", { m: money(Math.round(p.amount / 12)) }) : t(lang, "l_noCommission")}
              </p>
              {online ? (
                <PayButton endpoint={endpoint} months={p.months} label={t(lang, "bl_payCard")} errorLabel={t(lang, "err_payment_failed")} />
              ) : (
                <p className="mt-5 rounded-xl bg-slate-50 p-3 text-center text-sm text-slate-500">
                  {contact ? t(lang, "bl_onlineSoonContact", { c: contact }) : t(lang, "bl_onlineSoon")}
                </p>
              )}
            </div>
          );
        })}
      </section>
      {footer}
      {online && (
        <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
          <ShieldCheck size={16} className="text-brand-600" /> {t(lang, "bl_secure")}
          {test && <Chip tone="amber">TEST</Chip>}
        </p>
      )}
    </>
  );
}

type ManualInfo = { holder: string | null; ccp: string | null; rip: string | null; whatsapp: string | null };

/** هل ضُبط التحويل اليدوي (فتظهر بطاقته)؟ */
export function hasManualPayment(manual: ManualInfo): boolean {
  return Boolean(manual.ccp || manual.rip || manual.whatsapp);
}

/** التحويل اليدوي (بريدي موب / CCP) — يُعرض فقط إن ضُبطت بيانات الحساب. */
export function ManualPaymentCard({
  lang,
  manual,
  reference,
  waText,
}: {
  lang: Lang;
  manual: ManualInfo;
  reference: string;
  waText: string;
}) {
  if (!hasManualPayment(manual)) return null;
  return (
    <section className="card p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Landmark size={20} className="text-brand-600" /> {t(lang, "bl_manual")}
      </h2>
      <p className="mt-1 text-sm text-slate-600">{t(lang, "bl_manualSub")}</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {manual.holder && (
          <div className="rounded-2xl bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">{t(lang, "bl_holder")}</dt>
            <dd className="font-semibold">{manual.holder}</dd>
          </div>
        )}
        {manual.rip && (
          <div className="rounded-2xl bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">RIP (BaridiMob)</dt>
            <dd className="num font-semibold" dir="ltr">{manual.rip}</dd>
          </div>
        )}
        {manual.ccp && (
          <div className="rounded-2xl bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">CCP</dt>
            <dd className="num font-semibold" dir="ltr">{manual.ccp}</dd>
          </div>
        )}
        <div className="rounded-2xl bg-slate-50 p-3">
          <dt className="text-xs text-slate-500">{t(lang, "bl_reference")}</dt>
          <dd className="num font-semibold" dir="ltr">{reference}</dd>
        </div>
      </dl>
      {manual.whatsapp && (
        <a
          href={`https://wa.me/${manual.whatsapp}?text=${encodeURIComponent(`${waText} ${reference}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn mt-4 bg-[#128C7E] text-white hover:bg-[#0e6f64]"
        >
          <MessageCircle size={18} /> {t(lang, "bl_sendReceipt")}
        </a>
      )}
    </section>
  );
}

export function PaymentHistory({ lang, payments }: { lang: Lang; payments: Payment[] }) {
  const fmt = dateFmt(lang);
  return (
    <section className="card p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <CreditCard size={20} className="text-brand-600" /> {t(lang, "bl_history")}
      </h2>
      {payments.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{t(lang, "bl_noPayments")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="num mt-3 w-full text-sm">
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="py-2.5">{fmt.format(p.createdAt)}</td>
                  <td className="py-2.5">{p.months === 12 ? t(lang, "bl_yearly") : t(lang, "bl_nMonths", { n: p.months })}</td>
                  <td className="py-2.5" dir="ltr">{money(p.amount)}</td>
                  <td className="py-2.5 text-end">
                    <Chip tone={p.status === "paid" ? (p.amount === 0 ? "violet" : "green") : p.status === "failed" ? "rose" : "slate"}>
                      {t(lang, p.status === "paid" ? (p.amount === 0 ? "bl_gift" : "bl_paid") : p.status === "failed" ? "bl_failedSt" : "bl_pending")}
                    </Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
