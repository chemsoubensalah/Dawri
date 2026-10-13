import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, CheckCheck, Clock3, Hourglass, Timer, UserRoundX } from "lucide-react";
import BarChart from "@/components/BarChart";
import StaffFrame from "@/components/StaffFrame";
import { Stat } from "@/components/ui";
import { dayKey } from "@/lib/domain/time";
import { t, tn, drTitle } from "@/lib/i18n";
import { now as clockNow } from "@/lib/server/clock";
import { getDb } from "@/lib/server/db";
import { getLang, staffShop } from "@/lib/server/http";
import * as repo from "@/lib/server/repo";
import { staffReviews } from "@/lib/server/reviews";
import ReviewsPanel from "./ReviewsPanel";

export const metadata = { title: "الإحصاءات", robots: { index: false } };

const DAY = 86_400_000;

export default async function StatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { slug } = await params;
  const shop = await staffShop(slug);
  if (!shop) redirect(`/staff/${slug}`);
  const lang = await getLang(shop.defaultLang);
  const period = (await searchParams).p === "7" ? 7 : 30;
  const db = await getDb();
  const now = clockNow();
  const from = dayKey(new Date(now.getTime() - (period - 1) * DAY));
  const [daily, hourly, totals] = await Promise.all([
    repo.dailyStats(db, shop.id, from),
    // نفس نافذة الأيّام: من منتصف ليل أوّل يوم بتوقيت الجزائر (UTC+1)
    repo.hourlyCounts(db, shop.id, new Date(`${from}T00:00:00+01:00`)),
    repo.periodTotals(db, shop.id, from),
  ]);
  const reviews = await staffReviews(shop);

  // كلّ أيّام الفترة (حتى الأيّام بلا مرضى = 0)
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const days = Array.from({ length: period }, (_, i) => dayKey(new Date(now.getTime() - (period - 1 - i) * DAY)));
  const fmtDay = new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ" : "fr-DZ", { day: "numeric", month: "short", timeZone: "UTC", numberingSystem: "latn" });
  const dayLabel = (d: string) => fmtDay.format(new Date(`${d}T12:00:00Z`));
  const servedBars = days.map((d, i) => ({
    key: d,
    label: period === 7 || i % 5 === 0 || i === days.length - 1 ? d.slice(8) : "",
    tip: dayLabel(d),
    value: byDay.get(d)?.served ?? 0,
  }));
  const hourMap = new Map(hourly.map((h) => [h.hour, h.n]));
  const firstH = Math.min(6, ...hourly.map((h) => h.hour));
  const lastH = Math.max(18, ...hourly.map((h) => h.hour));
  const hourBars = Array.from({ length: lastH - firstH + 1 }, (_, i) => {
    const h = firstH + i;
    return { key: String(h), label: h % 2 === 0 ? `${h}` : "", tip: `${String(h).padStart(2, "0")}:00–${String(h + 1).padStart(2, "0")}:00`, value: hourMap.get(h) ?? 0 };
  });
  const peak = hourly.reduce<{ hour: number; n: number } | null>((a, b) => (!a || b.n > a.n ? b : a), null);
  const noShowRate = totals.served + totals.noShows > 0 ? Math.round((totals.noShows / (totals.served + totals.noShows)) * 100) : null;
  const perDay = totals.days > 0 ? Math.round(totals.served / totals.days) : 0;
  const min = (n: number | null) => (n === null ? "—" : t(lang, "sp_min", { n }));

  return (
    <StaffFrame lang={lang} slug={shop.slug} name={shop.name} doctor={drTitle(lang, shop.kind, shop.profile.doctorName)} look={shop.look} active="stats">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{t(lang, "nav_stats")}</h1>
          <div className="inline-flex rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-200" role="tablist">
            {[7, 30].map((p) => (
              <Link
                key={p}
                href={`?p=${p}`}
                role="tab"
                aria-selected={period === p}
                className={`rounded-xl px-4 py-1.5 text-sm font-semibold ${period === p ? "bg-ink text-white" : "text-slate-600 hover:text-ink"}`}
              >
                {tn(lang, "stt_lastN", p)}
              </Link>
            ))}
          </div>
        </div>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={<CheckCheck size={13} />} label={t(lang, "stt_served")} value={totals.served} hint={t(lang, "stt_perDay", { n: perDay })} />
          <Stat icon={<UserRoundX size={13} />} label={t(lang, "stt_noShowRate")} value={noShowRate === null ? "—" : `${noShowRate}%`} hint={t(lang, "stt_noShows", { n: totals.noShows })} />
          <Stat icon={<Hourglass size={13} />} label={t(lang, "avgWait")} value={min(totals.avgWaitMin)} hint={t(lang, "stt_waitHint")} />
          <Stat icon={<Timer size={13} />} label={t(lang, "avgService")} value={min(totals.avgServiceMin)} hint={t(lang, "stt_serviceHint")} />
        </section>

        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <section className="card">
            <h2 className="flex items-center gap-2 font-bold">
              <CalendarDays size={18} className="text-brand-600" /> {t(lang, "stt_dailyTitle")}
            </h2>
            <p className="mb-4 text-sm text-slate-500">{t(lang, "stt_dailySub")}</p>
            <BarChart data={servedBars} />
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-semibold text-slate-500 hover:text-ink">{t(lang, "stt_table")}</summary>
              <div className="mt-2 max-h-72 overflow-auto rounded-xl ring-1 ring-slate-200">
                <table className="num w-full text-center">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="p-2 text-start">{t(lang, "day")}</th>
                      <th className="p-2">{t(lang, "total")}</th>
                      <th className="p-2">{t(lang, "served")}</th>
                      <th className="p-2">{t(lang, "noShows")}</th>
                      <th className="p-2">{t(lang, "avgWait")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...days].reverse().map((d) => {
                      const r = byDay.get(d);
                      return (
                        <tr key={d} className="border-t border-slate-100">
                          <td className="p-2 text-start">{dayLabel(d)}</td>
                          <td className="p-2">{r?.total ?? 0}</td>
                          <td className="p-2">{r?.served ?? 0}</td>
                          <td className="p-2">{r?.noShows ?? 0}</td>
                          <td className="p-2">{r?.avgWaitMin ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          <section className="card">
            <h2 className="flex items-center gap-2 font-bold">
              <Clock3 size={18} className="text-brand-600" /> {t(lang, "stt_peakTitle")}
            </h2>
            <p className="mb-4 text-sm text-slate-500">
              {peak ? t(lang, "stt_peakSub", { h: `${String(peak.hour).padStart(2, "0")}:00` }) : t(lang, "stt_noData")}
            </p>
            <BarChart data={hourBars} />
            <p className="mt-3 text-xs text-slate-500">{t(lang, "stt_peakHint")}</p>
          </section>
        </div>

        <ReviewsPanel lang={lang} slug={shop.slug} data={reviews} />
      </div>
    </StaffFrame>
  );
}
