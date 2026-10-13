import { Building2, Hospital } from "lucide-react";
import { Chip, Logo } from "@/components/ui";
import { adminEnabled, isAdmin } from "@/lib/server/admin";
import { now as clockNow } from "@/lib/server/clock";
import { getDb } from "@/lib/server/db";
import * as repo from "@/lib/server/repo";
import * as crepo from "@/lib/server/clinicsRepo";
import { MAX_DOCTORS } from "@/lib/server/clinics";
import { paymentReference } from "@/lib/server/billing";
import { coveredByClinic, isSubscriptionActive, subscriptionStatus } from "@/lib/domain/subscription";
import { clinicPriceNumber, clinicYearPriceNumber, priceNumber, yearPriceNumber } from "@/lib/pricing";
import { adminStats } from "@/lib/server/analytics";
import AdminLogin, { ExtendForm, ResetPinButton } from "./AdminClient";
import StatsView from "./StatsView";

export const metadata = { title: "Admin", robots: { index: false } };

/** لوحة المؤسّس (بالفرنسية/العربية المختصرة): كلّ العيادات وحالة اشتراكها. */
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; d?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "accounts" ? "accounts" : "stats";
  const range = [7, 30, 90, 365].includes(Number(sp.d)) ? Number(sp.d) : 30;
  if (!adminEnabled()) {
    return <main className="p-10 text-center text-slate-500">ADMIN_SECRET غير مضبوط (12 حرفاً على الأقلّ).</main>;
  }
  if (!(await isAdmin())) return <AdminLogin />;
  const now = clockNow();
  const db = await getDb();
  const [shops, clinics] = await Promise.all([repo.listShopsAdmin(db, new Date(now.getTime() - 30 * 86_400_000)), crepo.listClinicsAdmin(db)]);
  const fmt = new Intl.DateTimeFormat("fr-DZ", { day: "2-digit", month: "2-digit", year: "numeric" });
  // نشطة = الاشتراك الفعلي (الخاصّ أو اشتراك العيادة متعدّدة الأطبّاء)
  const active = shops.filter((s) => isSubscriptionActive(s, now)).length;
  const paying =
    shops.filter((s) => s.paidUntil && s.paidUntil > now).length + clinics.filter((c) => c.paidUntil && c.paidUntil > now).length;
  const stats = tab === "stats" ? await adminStats(range) : null;
  const subs = [
    { key: "paid", label: "يدفع", n: shops.filter((s) => s.paidUntil && s.paidUntil > now).length },
    { key: "clinic", label: "مشمول باشتراك عيادة", n: shops.filter((s) => !(s.paidUntil && s.paidUntil > now) && coveredByClinic(s, now)).length },
    { key: "trial", label: "فترة تجربة", n: shops.filter((s) => isSubscriptionActive(s, now) && !(s.paidUntil && s.paidUntil > now) && !coveredByClinic(s, now)).length },
    { key: "expired", label: "منتهٍ", n: shops.filter((s) => !isSubscriptionActive(s, now)).length },
  ];
  const tabCls = (on: boolean) => `rounded-lg px-3 py-1.5 text-sm font-semibold ${on ? "bg-white text-brand-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`;
  return (
    <main className="min-h-dvh bg-[#f3f5f8] p-4 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex items-center justify-between">
          <Logo size={32} />
          <span className="text-sm text-slate-500">لوحة المؤسّس · Admin</span>
        </header>
        <nav className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-xl bg-slate-200/70 p-1">
            <a href={`/admin?d=${range}`} className={tabCls(tab === "stats")}>الإحصائيات</a>
            <a href="/admin?tab=accounts" className={tabCls(tab === "accounts")}>العيادات والاشتراكات</a>
          </div>
          {tab === "stats" && (
            <div className="flex gap-1 rounded-xl bg-slate-200/70 p-1">
              {[
                [7, "7 أيّام"],
                [30, "30 يوماً"],
                [90, "3 أشهر"],
                [365, "سنة"],
              ].map(([d, l]) => (
                <a key={d} href={`/admin?d=${d}`} className={tabCls(range === d)}>{l}</a>
              ))}
            </div>
          )}
        </nav>
        {stats ? (
          <StatsView s={stats} subs={subs} />
        ) : (
          <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["العيادات", shops.length],
              ["متعدّدة الأطبّاء", clinics.length],
              ["نشطة", active],
              ["تدفع", paying],
            ].map(([k, v]) => (
              <div key={String(k)} className="card p-4">
                <div className="text-sm text-slate-500">{k}</div>
                <div className="num text-3xl font-bold">{v}</div>
              </div>
            ))}
          </section>
          <section className="card overflow-x-auto p-0">
            <h2 className="flex items-center gap-2 p-4 pb-2 font-bold">
              <Hospital size={18} className="text-brand-600" /> العيادات متعدّدة الأطبّاء · Cliniques
            </h2>
            {clinics.length === 0 ? (
              <p className="p-4 pt-0 text-sm text-slate-500">لا عيادات متعدّدة الأطبّاء بعد.</p>
            ) : (
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-3 text-start">العيادة</th>
                    <th className="p-3 text-start">الأطبّاء</th>
                    <th className="p-3 text-start">الحالة</th>
                    <th className="p-3 text-start">تفعيل يدوي (سعر العيادة)</th>
                  </tr>
                </thead>
                <tbody>
                  {clinics.map((c) => {
                    const st = subscriptionStatus(c, now);
                    return (
                      <tr key={c.id} className="border-t border-slate-100 align-top" data-testid="admin-clinic">
                        <td className="p-3">
                          <div className="font-semibold">{c.name}</div>
                          <a href={`/c/${c.slug}`} target="_blank" className="text-xs text-brand-700 hover:underline" dir="ltr">
                            /c/{c.slug}
                          </a>
                          {c.ownerEmail && <div className="text-xs text-slate-500" dir="ltr">{c.ownerEmail}</div>}
                          <div className="num text-xs text-slate-500" dir="ltr" data-testid="admin-clinic-ref">{paymentReference("clinic", c.slug)}</div>
                        </td>
                        <td className="num p-3">{c.doctors} / {MAX_DOCTORS}</td>
                        <td className="p-3">
                          <Chip tone={st.paidUntil ? "green" : st.trial ? "violet" : "rose"}>
                            {st.paidUntil ? `مدفوع حتى ${fmt.format(st.paidUntil)}` : st.trial ? `تجربة حتى ${fmt.format(st.until)}` : "منتهٍ"}
                          </Chip>
                        </td>
                        <td className="p-3">
                          <ExtendForm clinicId={c.id} price={clinicPriceNumber()} yearPrice={clinicYearPriceNumber()} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
          <section className="card overflow-x-auto p-0">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-3 text-start">العيادة</th>
                  <th className="p-3 text-start">أُنشئت</th>
                  <th className="p-3 text-start">الحالة</th>
                  <th className="p-3 text-start">تذاكر 30 يوماً</th>
                  <th className="p-3 text-start">تفعيل يدوي</th>
                </tr>
              </thead>
              <tbody>
                {shops.map((s) => {
                  const paid = s.paidUntil && s.paidUntil > now;
                  const trial = !paid && s.trialEndsAt > now;
                  const viaClinic = !paid && coveredByClinic(s, now);
                  return (
                    <tr key={s.id} className="border-t border-slate-100 align-top">
                      <td className="p-3">
                        <div className="flex items-center gap-2 font-semibold">
                          <Building2 size={16} className="text-brand-600" /> {s.name}
                        </div>
                        <a href={`/s/${s.slug}`} target="_blank" className="text-xs text-brand-700 hover:underline" dir="ltr">
                          /s/{s.slug}
                        </a>
                        {s.profile.phone && <div className="num text-xs text-slate-500" dir="ltr">{s.profile.phone}</div>}
                        {s.ownerEmail && <div className="text-xs text-slate-500" dir="ltr">{s.ownerEmail}</div>}
                        <div className="num text-xs text-slate-500" dir="ltr">{paymentReference("cabinet", s.slug)}</div>
                        <ResetPinButton shopId={s.id} />
                      </td>
                      <td className="num p-3 text-slate-600">{fmt.format(s.createdAt)}</td>
                      <td className="p-3">
                        <Chip tone={paid ? "green" : viaClinic ? "green" : trial ? "violet" : "rose"}>
                          {paid
                            ? `مدفوع حتى ${fmt.format(s.paidUntil!)}`
                            : viaClinic
                              ? `مشمول بالعيادة حتى ${fmt.format(s.clinicUntil!)}`
                              : trial
                                ? `تجربة حتى ${fmt.format(s.trialEndsAt)}`
                                : "منتهٍ"}
                        </Chip>
                        {s.clinicSlug && (
                          <div className="mt-1 text-xs text-slate-500">
                            عيادة: <span dir="ltr">/c/{s.clinicSlug}</span>
                          </div>
                        )}
                      </td>
                      <td className="num p-3">{s.tickets30d}</td>
                      <td className="p-3">
                        <ExtendForm shopId={s.id} price={priceNumber()} yearPrice={yearPriceNumber()} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
          </>
        )}
      </div>
    </main>
  );
}
