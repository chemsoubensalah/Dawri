import { redirect } from "next/navigation";
import { CalendarCheck2, CheckCircle2, CreditCard, Landmark, MessageCircle, ShieldCheck, XCircle } from "lucide-react";
import StaffFrame from "@/components/StaffFrame";
import { Chip } from "@/components/ui";
import { t } from "@/lib/i18n";
import { chargilyConfig, manualPayment, plans } from "@/lib/server/billing";
import { now as clockNow } from "@/lib/server/clock";
import { getDb } from "@/lib/server/db";
import { getLang, staffShop } from "@/lib/server/http";
import * as repo from "@/lib/server/repo";
import { isSubscriptionActive } from "@/lib/server/service";
import PayButton from "./PayButton";

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
  const shop = await staffShop(slug);
  if (!shop) redirect(`/staff/${slug}`);
  const lang = await getLang(shop.defaultLang);
  const now = clockNow();
  const db = await getDb();
  const payments = await repo.listPayments(db, shop.id);
  const fmt = new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ" : "fr-DZ", { day: "numeric", month: "long", year: "numeric", numberingSystem: "latn" });
  // عزل اتّجاه المبلغ (LRI…PDI) كي لا ينقلب داخل جملة عربية
  const money = (n: number) => `\u2066${n.toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ")} DA\u2069`;

  const active = isSubscriptionActive(shop, now);
  const paidUntil = shop.paidUntil && shop.paidUntil > now ? shop.paidUntil : null;
  const inTrial = !paidUntil && shop.trialEndsAt > now;
  const trialDaysLeft = Math.max(0, Math.ceil((shop.trialEndsAt.getTime() - now.getTime()) / DAY));
  const trialProgress = Math.min(1, Math.max(0, 1 - trialDaysLeft / 60));
  const online = chargilyConfig().enabled;
  const manual = manualPayment();
  const ref = `DAWRI-${shop.slug.toUpperCase()}`;

  return (
    <StaffFrame lang={lang} slug={shop.slug} name={shop.name} active="billing">
      <div className="mx-auto max-w-4xl space-y-5">
        <h1 className="text-2xl font-bold">{t(lang, "nav_billing")}</h1>

        {sp.paid && (
          <div className="flex items-center gap-3 rounded-2xl bg-brand-50 p-4 font-semibold text-brand-800 ring-1 ring-brand-200">
            <CheckCircle2 size={20} /> {t(lang, "bl_thanks")}
          </div>
        )}
        {sp.failed && (
          <div className="flex items-center gap-3 rounded-2xl bg-rose-50 p-4 font-semibold text-rose-800 ring-1 ring-rose-200">
            <XCircle size={20} /> {t(lang, "bl_failed")}
          </div>
        )}

        {/* ——— الحالة ——— */}
        <section className="card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                <CalendarCheck2 size={24} />
              </span>
              <div>
                <div className="text-sm text-slate-500">{t(lang, "l_planName")}</div>
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
              {paidUntil ? t(lang, "bl_stActive") : inTrial ? t(lang, "bl_stTrial", { n: trialDaysLeft }) : t(lang, "bl_stExpired")}
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
        <section className="grid gap-4 md:grid-cols-2">
          {plans().map((p) => (
            <div key={p.months} className={`card relative p-6 ${p.months === 12 ? "ring-2 ring-brand-500" : ""}`}>
              {p.months === 12 && (
                <span className="absolute -top-3 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white ltr:right-5 rtl:left-5">
                  {t(lang, "bl_bestValue")}
                </span>
              )}
              <div className="font-bold">{p.months === 1 ? t(lang, "bl_monthly") : t(lang, "bl_yearly")}</div>
              <div className="mt-3 flex items-end gap-2">
                <span className="num text-4xl font-bold" dir="ltr">{money(p.amount)}</span>
                <span className="mb-1 text-sm text-slate-500">{p.months === 1 ? t(lang, "l_perMonth") : t(lang, "bl_perYear")}</span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {p.months === 12 ? t(lang, "bl_yearlyNote", { m: money(Math.round(p.amount / 12)) }) : t(lang, "l_noCommission")}
              </p>
              {online ? (
                <PayButton slug={shop.slug} months={p.months} label={t(lang, "bl_payCard")} errorLabel={t(lang, "err_payment_failed")} />
              ) : (
                <p className="mt-5 rounded-xl bg-slate-50 p-3 text-center text-sm text-slate-500">{t(lang, "bl_onlineSoon")}</p>
              )}
            </div>
          ))}
        </section>
        {online && (
          <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
            <ShieldCheck size={16} className="text-brand-600" /> {t(lang, "bl_secure")}
            {chargilyConfig().test && <Chip tone="amber">TEST</Chip>}
          </p>
        )}

        {/* ——— دفع يدوي ——— */}
        {(manual.ccp || manual.rip || manual.whatsapp) && (
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
                <dd className="num font-semibold" dir="ltr">{ref}</dd>
              </div>
            </dl>
            {manual.whatsapp && (
              <a
                href={`https://wa.me/${manual.whatsapp}?text=${encodeURIComponent(`${t(lang, "bl_waText")} ${ref}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn mt-4 bg-[#25D366] text-white hover:bg-[#1ebe5b]"
              >
                <MessageCircle size={18} /> {t(lang, "bl_sendReceipt")}
              </a>
            )}
          </section>
        )}

        {/* ——— السجلّ ——— */}
        <section className="card p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <CreditCard size={20} className="text-brand-600" /> {t(lang, "bl_history")}
          </h2>
          {payments.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{t(lang, "bl_noPayments")}</p>
          ) : (
            <table className="num mt-3 w-full text-sm">
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="py-2.5">{fmt.format(p.createdAt)}</td>
                    <td className="py-2.5">{p.months === 12 ? t(lang, "bl_yearly") : t(lang, "bl_nMonths", { n: p.months })}</td>
                    <td className="py-2.5" dir="ltr">{money(p.amount)}</td>
                    <td className="py-2.5 text-end">
                      <Chip tone={p.status === "paid" ? "green" : p.status === "failed" ? "rose" : "slate"}>
                        {t(lang, p.status === "paid" ? "bl_paid" : p.status === "failed" ? "bl_failedSt" : "bl_pending")}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </StaffFrame>
  );
}
