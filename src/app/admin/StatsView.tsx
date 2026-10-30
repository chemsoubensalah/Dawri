import { ArrowDownRight, ArrowUpRight, Banknote, CalendarCheck, CalendarClock, CalendarDays, Clock, Eye, MousePointerClick, Star, Stethoscope, UserRoundX, Users, UserCheck, UserPlus } from "lucide-react";
import type { AdminStats, Kpis } from "@/lib/server/analytics";
import { wilayaName } from "@/lib/domain/wilayas";
import { Columns, HBars } from "./Charts";
import { fmtN, SERIES } from "./format";

const SECTION: Record<string, string> = {
  home: "الصفحة الرئيسية",
  shop: "صفحة الطبيب (المرضى)",
  book: "صفحة حجز موعد",
  ticket: "تذكرة المريض",
  appt: "صفحة الموعد",
  tv: "شاشة القاعة",
  doctors: "دليل الأطبّاء",
  signup: "صفحة التسجيل",
  staff: "لوحة الطبيب/السكرتيرة",
  clinic: "صفحات العيادات",
  other: "صفحات أخرى",
};
const SOURCE: Record<string, string> = {
  direct: "مباشر / واتساب / رسالة",
  qr: "مسح رمز QR في العيادة",
  internal: "من داخل الموقع",
  google: "Google",
  facebook: "Facebook / Messenger",
  instagram: "Instagram",
  whatsapp: "WhatsApp Web",
  tiktok: "TikTok",
  other: "مواقع أخرى",
};
const DEVICE: Record<string, string> = { mobile: "هاتف", desktop: "حاسوب", tv: "تلفاز" };
const OUTCOME: Record<string, string> = {
  done: "تمّ الفحص",
  no_show: "غائب",
  cancelled: "ألغى المريض",
  expired: "انتهت (نهاية اليوم)",
  rejected: "مرفوضة",
  waiting: "في الانتظار",
  called: "يُنادى الآن",
  deferred: "مؤجَّلة",
  pending_approval: "تنتظر الموافقة",
};
const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const WEEKDAYS_SHORT = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const MONTHS = ["جانفي", "فيفري", "مارس", "أفريل", "ماي", "جوان", "جويلية", "أوت", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

const short = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

function Delta({ now, before, invert = false }: { now: number; before: number; invert?: boolean }) {
  if (before === 0) return now > 0 ? <span className="text-xs text-slate-400">جديد</span> : null;
  const d = Math.round(((now - before) / before) * 100);
  if (d === 0) return <span className="num text-xs text-slate-400">= 0%</span>;
  const good = invert ? d < 0 : d > 0;
  const Icon = d > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`num inline-flex items-center text-xs font-semibold ${good ? "text-emerald-700" : "text-rose-700"}`} dir="ltr">
      <Icon size={14} />
      {d > 0 ? "+" : ""}
      {d}%
    </span>
  );
}

function Tile({ icon: Icon, label, value, sub, delta }: { icon: React.ElementType; label: string; value: string; sub?: string; delta?: React.ReactNode }) {
  return (
    <div className="card p-4" data-testid="admin-kpi">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Icon size={16} className="text-brand-600" /> {label}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="num text-2xl font-bold whitespace-nowrap sm:text-3xl">{value}</span>
        {delta}
      </div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function Panel({ title, sub, children, className = "" }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      <h3 className="font-bold">{title}</h3>
      {sub && <p className="mb-3 text-xs text-slate-500">{sub}</p>}
      {!sub && <div className="mb-3" />}
      {children}
    </section>
  );
}

/** المواعيد: كم شخصاً حجز (وحده أو عند السكرتيرة)، كم زائراً فتح صفحة الحجز، والحضور — ثمّ كلّ عيادة وحدها. */
function Appointments({ s, vs }: { s: AdminStats; vs: string }) {
  const a = s.appts;
  const booked = a.online + a.desk;
  const prevBooked = s.prev.appointments;
  const ended = a.arrived + a.noShow;
  // النسبة على الأيّام التي عُدّت فيها صفحة الحجز فقط (وإلّا تتجاوز 100%)
  const trackedOnline = a.bookSince ? a.daily.filter((d) => d.day >= a.bookSince!).reduce((t, d) => t + d.online, 0) : 0;
  return (
    <section className="card space-y-4 p-4 sm:p-5" data-testid="admin-appts">
      <div className="flex items-center gap-2">
        <CalendarDays size={20} className="text-brand-600" />
        <h3 className="text-lg font-bold">المواعيد</h3>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          icon={CalendarCheck}
          label="أشخاص حجزوا موعداً"
          value={fmtN(booked)}
          sub={`${fmtN(a.online)} من الهاتف · ${fmtN(a.desk)} عند السكرتيرة${a.cancelled ? ` · ${fmtN(a.cancelled)} ألغوا` : ""}`}
          delta={<Delta now={booked} before={prevBooked} />}
        />
        <Tile
          icon={MousePointerClick}
          label="زوّار صفحة الحجز"
          value={fmtN(a.bookVisitors)}
          sub={a.bookVisitors ? `${Math.min(100, pct(trackedOnline, a.bookVisitors))}% منهم حجزوا فعلاً` : "زائر مختلف كلّ يوم"}
          delta={<Delta now={a.bookVisitors} before={a.prevBookVisitors} />}
        />
        <Tile icon={CalendarClock} label="مواعيد قادمة" value={fmtN(a.upcoming)} sub="محجوزة لليوم وما بعده (كلّ العيادات)" />
        <Tile
          icon={UserCheck}
          label="حضروا موعدهم"
          value={ended ? `${pct(a.arrived, ended)}%` : "—"}
          sub={ended ? `${fmtN(a.arrived)} حضر · ${fmtN(a.noShow)} غاب` : "لا مواعيد مضت في الفترة"}
        />
      </div>
      <p className="-mt-1 text-xs text-slate-400">
        الحجوزات تُعدّ بيوم الحجز لا بيوم الموعد. النسب الملوّنة {vs}.
      </p>

      <Panel title="الحجوزات يومياً" sub="متى حجز الناس (لا يوم الموعد نفسه)" className="bg-slate-50/60 shadow-none">
        <Columns
          data={a.daily.map((d) => ({ label: short(d.day), title: d.day, values: [d.online, d.desk] }))}
          series={[
            { name: "حجز من الهاتف", color: SERIES[0] },
            { name: "عند السكرتيرة", color: SERIES[1] },
          ]}
        />
      </Panel>

      <div>
        <h4 className="mb-2 font-bold">حسب العيادة</h4>
        {a.byClinic.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">لا مواعيد ولا زيارات لصفحات الحجز في هذه الفترة.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
            <table className="w-full min-w-[640px] text-sm" data-testid="admin-appts-clinics">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2 text-start font-semibold">العيادة</th>
                  {/* الأهمّ أوّلاً: على الهاتف يظهر دون سحب الجدول */}
                  <th className="px-2 py-2 font-semibold">حجزوا من الهاتف</th>
                  <th className="px-2 py-2 font-semibold">عند السكرتيرة</th>
                  <th className="px-2 py-2 font-semibold">قادمة</th>
                  <th className="px-2 py-2 font-semibold">فتحوا صفحة الحجز</th>
                  <th className="px-2 py-2 font-semibold">زوّار صفحتها</th>
                  <th className="px-2 py-2 font-semibold">ألغوا</th>
                </tr>
              </thead>
              <tbody className="num text-center">
                {a.byClinic.map((c) => (
                  <tr key={c.slug} className="border-b border-slate-100 last:border-0">
                    <td className="max-w-56 truncate py-2 text-start font-semibold">
                      <a href={`/s/${c.slug}`} target="_blank" className="hover:underline">
                        {c.name}
                      </a>
                    </td>
                    <td className="px-2 py-2 font-bold text-brand-800">{fmtN(c.online)}</td>
                    <td className="px-2 py-2">{fmtN(c.desk)}</td>
                    <td className="px-2 py-2 font-bold">{fmtN(c.upcoming)}</td>
                    <td className="px-2 py-2">{fmtN(c.bookVisitors)}</td>
                    <td className="px-2 py-2">{fmtN(c.pageVisitors)}</td>
                    <td className="px-2 py-2 text-slate-500">{fmtN(c.cancelled)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-400">
          «زوّار صفحتها» و«فتحوا صفحة الحجز»: أشخاص مختلفون كلّ يوم.
          {a.bookSince ? ` صفحة الحجز تُعدّ وحدها منذ ${short(a.bookSince)}/${a.bookSince.slice(0, 4)} — قبل ذلك كانت ضمن زوّار صفحة الطبيب.` : " صفحة الحجز ستُعدّ وحدها ابتداءً من أوّل زيارة لها."}
        </p>
      </div>
    </section>
  );
}

export default function StatsView({ s, subs }: { s: AdminStats; subs: { key: string; label: string; n: number }[] }) {
  const k: Kpis = s.kpi;
  const p: Kpis = s.prev;
  const noShowRate = pct(k.noShows, k.patients);
  const vs = `مقارنةً بالـ ${s.range} يوماً السابقة`;
  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={Users} label="الزوّار" value={fmtN(k.visitors)} sub="زائر مختلف كلّ يوم (مجموع الأيّام)" delta={<Delta now={k.visitors} before={p.visitors} />} />
        <Tile icon={Eye} label="مشاهدات الصفحات" value={fmtN(k.views)} sub={k.visitors ? `${(k.views / k.visitors).toFixed(1)} صفحة لكلّ زائر` : undefined} delta={<Delta now={k.views} before={p.views} />} />
        <Tile icon={UserCheck} label="المرضى (تذاكر)" value={fmtN(k.patients)} sub={`${pct(k.online, k.patients)}% أخذوا رقمهم من الهاتف`} delta={<Delta now={k.patients} before={p.patients} />} />
        <Tile icon={Stethoscope} label="تمّ فحصهم" value={fmtN(k.served)} sub={`${pct(k.served, k.patients)}% من التذاكر`} delta={<Delta now={k.served} before={p.served} />} />
        <Tile icon={UserRoundX} label="نسبة الغياب" value={`${noShowRate}%`} sub={`${fmtN(k.noShows)} غائب`} delta={<Delta now={noShowRate} before={pct(p.noShows, p.patients)} invert />} />
        <Tile icon={Clock} label="متوسّط الانتظار" value={k.waitMin == null ? "—" : `${k.waitMin} د`} sub="من أخذ الرقم/الوصول حتى المناداة" delta={k.waitMin != null && p.waitMin != null ? <Delta now={k.waitMin} before={p.waitMin} invert /> : null} />
        <Tile icon={UserPlus} label="أطبّاء جدد" value={fmtN(k.signups)} sub={`${fmtN(s.activeDoctors)} طبيب نشط هذا الأسبوع`} delta={<Delta now={k.signups} before={p.signups} />} />
        <Tile icon={Banknote} label="المداخيل" value={`${fmtN(k.revenue)} دج`} sub={`${fmtN(k.appointments)} موعد محجوز`} delta={<Delta now={k.revenue} before={p.revenue} />} />
      </section>
      <p className="-mt-2 text-xs text-slate-400">النسب الملوّنة {vs}.</p>

      <section className="card grid grid-cols-2 gap-4 p-4 text-center sm:grid-cols-5">
        {[
          ["كلّ المرضى منذ البداية", fmtN(s.totals.patients)],
          ["كلّ الأطبّاء المسجّلين", fmtN(s.totals.doctors)],
          ["أطبّاء نشطون (7 أيّام)", fmtN(s.activeDoctors)],
          ["كلّ المداخيل", `${fmtN(s.totals.revenue)} دج`],
          ["التقييمات", s.totals.rating == null ? "—" : `${s.totals.rating} ★ (${fmtN(s.totals.reviews)})`],
        ].map(([a, b]) => (
          <div key={a}>
            <div className="num text-xl font-bold text-brand-800">{b}</div>
            <div className="text-xs text-slate-500">{a}</div>
          </div>
        ))}
      </section>

      <Appointments s={s} vs={vs} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="الزوّار يومياً" sub="كلّ من فتح الموقع (المرضى + الأطبّاء + الزوّار)">
          <Columns data={s.visitsDaily.map((d) => ({ label: short(d.day), title: d.day, values: [d.visitors] }))} series={[{ name: "زوّار", color: SERIES[0] }]} />
        </Panel>
        <Panel title="المرضى يومياً" sub="كلّ التذاكر في كلّ العيادات">
          <Columns
            data={s.ticketsDaily.map((d) => ({ label: short(d.day), title: d.day, values: [d.online, d.desk] }))}
            series={[
              { name: "من الهاتف", color: SERIES[0] },
              { name: "من الاستقبال", color: SERIES[1] },
            ]}
          />
        </Panel>
        <Panel title="المداخيل الشهرية" sub="آخر 12 شهراً (دفعات مؤكَّدة)">
          <Columns
            data={s.revenueMonthly.map((m) => ({ label: `${m.month.slice(5)}/${m.month.slice(2, 4)}`, title: `${MONTHS[Number(m.month.slice(5)) - 1]} ${m.month.slice(0, 4)}`, values: [m.amount] }))}
            series={[{ name: "المداخيل", color: SERIES[2] }]}
            unit=" دج"
            every={2}
          />
        </Panel>
        <Panel title="تسجيلات الأطبّاء" sub="حسابات جديدة يومياً">
          <Columns data={s.signupsDaily.map((d) => ({ label: short(d.day), title: d.day, values: [d.n] }))} series={[{ name: "تسجيلات", color: SERIES[0] }]} />
        </Panel>
        <Panel title="ساعات الذروة" sub="متى يأخذ المرضى أرقامهم (بتوقيت الجزائر)">
          <Columns data={s.hours.map((v, h) => ({ label: String(h), title: `${h}:00 – ${h + 1}:00`, values: [v] }))} series={[{ name: "مرضى", color: SERIES[0] }]} every={3} height={140} />
        </Panel>
        <Panel title="أيّام الأسبوع" sub="أيّ الأيّام أكثر ازدحاماً">
          <Columns data={s.weekdays.map((v, i) => ({ label: WEEKDAYS_SHORT[i], title: WEEKDAYS[i], values: [v] }))} series={[{ name: "مرضى", color: SERIES[0] }]} every={1} height={140} />
        </Panel>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="أين يذهب الزوّار" sub="الصفحات حسب عدد الزوّار">
          <HBars rows={s.sections.map((r) => ({ key: r.key, label: SECTION[r.key] ?? r.key, n: r.n }))} empty="لا زيارات بعد" />
        </Panel>
        <Panel title="من أين يأتون" sub="مصدر الزيارة">
          <HBars rows={s.sources.map((r) => ({ key: r.key, label: SOURCE[r.key] ?? r.key, n: r.n }))} color={SERIES[1]} empty="لا زيارات بعد" />
        </Panel>
        <Panel title="الأجهزة">
          <HBars rows={s.devices.map((r) => ({ key: r.key, label: DEVICE[r.key] ?? r.key, n: r.n }))} color={SERIES[2]} empty="لا زيارات بعد" />
        </Panel>
        <Panel title="أكثر الأطبّاء مرضى" sub="عدد التذاكر في الفترة">
          <HBars rows={s.topDoctors.map((r) => ({ key: r.slug, label: <a href={`/s/${r.slug}`} target="_blank" className="hover:underline">{r.name}</a>, n: r.n }))} empty="لا مرضى بعد" />
        </Panel>
        <Panel title="أكثر صفحات الأطبّاء زيارةً" sub="زوّار صفحة الطبيب وصفحة الحجز">
          <HBars rows={s.topPages.map((r) => ({ key: r.slug, label: <a href={`/s/${r.slug}`} target="_blank" className="hover:underline">{r.name}</a>, n: r.n }))} color={SERIES[1]} empty="لا زيارات بعد" />
        </Panel>
        <Panel title="مصير التذاكر" sub="ماذا حدث لكلّ رقم">
          <HBars rows={s.outcomes.map((r) => ({ key: r.key, label: OUTCOME[r.key] ?? r.key, n: r.n }))} color={SERIES[2]} empty="لا مرضى بعد" />
        </Panel>
        <Panel title="الأطبّاء حسب الولاية">
          <HBars rows={s.wilayas.map((r) => ({ key: String(r.code), label: wilayaName("ar", r.code) ?? "غير محدّدة", n: r.n }))} empty="لا أطبّاء بعد" />
        </Panel>
        <Panel title="حالة الاشتراكات" sub="الطوابير (عيادات طبيب واحد + أطبّاء العيادات)">
          <HBars rows={subs.map((r) => ({ key: r.key, label: r.label, n: r.n }))} color={SERIES[1]} empty="لا أطبّاء بعد" />
        </Panel>
        <Panel title="التقييمات">
          <div className="rounded-xl bg-slate-50 p-3 text-center">
            <Star className="mx-auto text-amber-500" size={20} />
            <div className="num mt-1 text-2xl font-bold">{s.totals.rating ?? "—"}</div>
            <div className="text-xs text-slate-500">{fmtN(s.totals.reviews)} تقييم</div>
          </div>
        </Panel>
      </div>
      <p className="text-center text-xs text-slate-400">
        الزوّار يُعدّون دون كوكي ودون حفظ عنوان IP: بصمة مجهولة تتغيّر كلّ يوم.
      </p>
    </div>
  );
}
