import { Building2 } from "lucide-react";
import { Chip, Logo } from "@/components/ui";
import { adminEnabled, isAdmin } from "@/lib/server/admin";
import { now as clockNow } from "@/lib/server/clock";
import { getDb } from "@/lib/server/db";
import * as repo from "@/lib/server/repo";
import { priceNumber, yearPriceNumber } from "@/lib/pricing";
import AdminLogin, { ExtendForm, ResetPinButton } from "./AdminClient";

export const metadata = { title: "Admin", robots: { index: false } };

/** لوحة المؤسّس (بالفرنسية/العربية المختصرة): كلّ العيادات وحالة اشتراكها. */
export default async function AdminPage() {
  if (!adminEnabled()) {
    return <main className="p-10 text-center text-slate-500">ADMIN_SECRET غير مضبوط (12 حرفاً على الأقلّ).</main>;
  }
  if (!(await isAdmin())) return <AdminLogin />;
  const now = clockNow();
  const shops = await repo.listShopsAdmin(await getDb(), new Date(now.getTime() - 30 * 86_400_000));
  const fmt = new Intl.DateTimeFormat("fr-DZ", { day: "2-digit", month: "2-digit", year: "numeric" });
  const active = shops.filter((s) => (s.paidUntil && s.paidUntil > now) || s.trialEndsAt > now).length;
  const paying = shops.filter((s) => s.paidUntil && s.paidUntil > now).length;
  return (
    <main className="min-h-dvh bg-[#f3f5f8] p-4 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex items-center justify-between">
          <Logo size={32} />
          <span className="text-sm text-slate-500">لوحة المؤسّس · Admin</span>
        </header>
        <section className="grid grid-cols-3 gap-3">
          {[
            ["العيادات", shops.length],
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
                      <ResetPinButton shopId={s.id} />
                    </td>
                    <td className="num p-3 text-slate-600">{fmt.format(s.createdAt)}</td>
                    <td className="p-3">
                      <Chip tone={paid ? "green" : trial ? "violet" : "rose"}>
                        {paid ? `مدفوع حتى ${fmt.format(s.paidUntil!)}` : trial ? `تجربة حتى ${fmt.format(s.trialEndsAt)}` : "منتهٍ"}
                      </Chip>
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
      </div>
    </main>
  );
}
