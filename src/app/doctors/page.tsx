import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, Clock3, Hourglass, MapPin, Search, Stethoscope, Users } from "lucide-react";
import LangSwitch from "@/components/LangSwitch";
import MyVisits from "@/components/MyVisits";
import RatingBadge from "@/components/RatingBadge";
import { Chip, Empty, LiveDot, Logo } from "@/components/ui";
import type { Lang } from "@/lib/domain/types";
import { WILAYAS, wilayaName } from "@/lib/domain/wilayas";
import { dirOf, drTitle, t, type DictKey } from "@/lib/i18n";
import { getLang } from "@/lib/server/http";
import { directory, type DirectoryEntry } from "@/lib/server/reviews";

type SP = Record<string, string | string[] | undefined>;
type Props = { searchParams: Promise<SP> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const lang = await getLang(undefined, one(sp.lang));
  const w = wilayaName(lang, Number(one(sp.wilaya)));
  const title = w ? `${t(lang, "rv_dirTitle")} · ${w}` : t(lang, "rv_dirTitle");
  const filtered = Boolean(one(sp.q) || (one(sp.page) && one(sp.page) !== "1"));
  return {
    title: { absolute: `${title} · دوري` },
    description: t(lang, "rv_metaDesc"),
    alternates: { canonical: w ? `/doctors?wilaya=${one(sp.wilaya)}` : "/doctors", languages: { ar: "/doctors", fr: "/doctors?lang=fr" } },
    // نتائج البحث الحرّ لا تُفهرس (محتوى مكرّر)؛ الدليل وصفحات الولايات تُفهرس
    robots: { index: !filtered, follow: true },
    openGraph: { title, description: t(lang, "rv_metaDesc"), type: "website" },
  };
}

function href(base: { q: string; wilaya: number | null; lang?: string }, page: number) {
  const p = new URLSearchParams();
  if (base.q) p.set("q", base.q);
  if (base.wilaya) p.set("wilaya", String(base.wilaya));
  if (base.lang) p.set("lang", base.lang);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `/doctors?${s}` : "/doctors";
}

function StatusChip({ lang, e }: { lang: Lang; e: DirectoryEntry }) {
  if (e.status === "open")
    return (
      <Chip tone="green">
        <LiveDot /> {t(lang, "rv_open")}
      </Chip>
    );
  if (e.status === "break" || e.status === "later")
    return (
      <Chip tone="amber">
        <Clock3 size={12} />
        {t(lang, e.status === "break" ? "rv_break" : "rv_later", { at: e.opensAt ?? "" })}
      </Chip>
    );
  return (
    <Chip>
      <LiveDot on={false} /> {t(lang, "rv_closed")}
    </Chip>
  );
}

function Card({ lang, e, qs }: { lang: Lang; e: DirectoryEntry; qs: string }) {
  const doctor = drTitle(lang, e.kind, e.profile.doctorName);
  const sub = e.profile.specialty || t(lang, `kind_${e.kind}` as DictKey);
  const w = wilayaName(lang, e.profile.wilaya);
  return (
    <li>
      <Link
        href={`/s/${e.slug}${qs}`}
        className="card flex h-full flex-col gap-3 p-4 transition hover:shadow-(--shadow-lift) hover:ring-brand-300 focus-visible:ring-2 focus-visible:ring-brand-500"
        data-testid={`dir-${e.slug}`}
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
            <Stethoscope size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="leading-snug font-bold text-ink">{e.name}</h2>
            {doctor && <p className="text-sm leading-snug font-semibold text-brand-700">{doctor}</p>}
            <p className="truncate text-sm text-slate-500">{sub}</p>
          </div>
          {e.rating && <RatingBadge lang={lang} avg={e.rating.avg} count={e.rating.count} className="shrink-0" />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip lang={lang} e={e} />
          {w && (
            <Chip>
              <MapPin size={12} /> {w}
            </Chip>
          )}
        </div>
        {e.status !== "closed" && e.waitMin !== null && (
          <div className="mt-auto flex items-center justify-between gap-2 rounded-2xl bg-slate-50 px-3.5 py-2.5 ring-1 ring-slate-200/70">
            <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
              <Hourglass size={15} className="text-brand-600" />
              {e.waiting === 0 && e.waitMin <= 1 ? t(lang, "rv_waitNone") : t(lang, "rv_wait", { n: e.waitMin })}
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Users size={13} /> <span className="num">{t(lang, "rv_waiting", { n: e.waiting })}</span>
            </span>
          </div>
        )}
      </Link>
    </li>
  );
}

export default async function DoctorsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const langQ = one(sp.lang);
  const lang = await getLang(undefined, langQ);
  const res = await directory({ q: one(sp.q), wilaya: one(sp.wilaya), page: one(sp.page) });
  const base = { q: res.q, wilaya: res.wilaya, lang: langQ === "fr" || langQ === "ar" ? langQ : undefined };
  const qs = base.lang ? `?lang=${base.lang}` : "";
  const Prev = lang === "ar" ? ChevronRight : ChevronLeft;
  const Next = lang === "ar" ? ChevronLeft : ChevronRight;

  return (
    <div className="bg-mesh min-h-dvh" dir={dirOf(lang)} lang={lang}>
      <div className="mx-auto max-w-5xl px-4 pt-4 pb-12">
        <header className="mb-6 flex items-center justify-between">
          <Link href="/" aria-label="Dawri">
            <Logo size={30} />
          </Link>
          <LangSwitch lang={lang} />
        </header>
        <MyVisits lang={lang} className="mb-6" />

        <div className="mb-5">
          <h1 className="text-2xl leading-snug font-bold tracking-tight text-ink sm:text-3xl">{t(lang, "rv_dirTitle")}</h1>
          <p className="mt-1.5 leading-relaxed text-slate-600">{t(lang, "rv_dirSub")}</p>
        </div>

        <form method="get" action="/doctors" className="card mb-5 grid gap-2.5 p-3 sm:grid-cols-[1fr_220px_auto]" role="search">
          {base.lang && <input type="hidden" name="lang" value={base.lang} />}
          <label className="relative">
            <span className="sr-only">{t(lang, "rv_search")}</span>
            <Search size={18} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="search" name="q" defaultValue={res.q} maxLength={60} placeholder={t(lang, "rv_search")} className="input ps-10" />
          </label>
          <label>
            <span className="sr-only">{t(lang, "rv_wilaya")}</span>
            <select name="wilaya" defaultValue={res.wilaya ?? ""} className="input">
              <option value="">{t(lang, "rv_allWilayas")}</option>
              {WILAYAS.map((w) => (
                <option key={w.code} value={w.code}>
                  {String(w.code).padStart(2, "0")} · {w[lang]}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary">
            <Search size={17} /> {t(lang, "rv_filter")}
          </button>
        </form>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
          <span className="num">{t(lang, "rv_results", { n: res.total })}</span>
          <span className="flex items-center gap-1.5">
            <LiveDot /> {t(lang, "rv_liveNote")}
          </span>
        </div>

        {res.entries.length === 0 ? (
          <div className="card">
            <Empty icon={<Stethoscope size={40} />} title={t(lang, "rv_empty")} sub={t(lang, "rv_emptySub")} />
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {res.entries.map((e) => (
              <Card key={e.slug} lang={lang} e={e} qs={qs} />
            ))}
          </ul>
        )}

        {res.pages > 1 && (
          <nav className="mt-6 flex items-center justify-center gap-3" aria-label="pagination">
            {res.page > 1 ? (
              <Link href={href(base, res.page - 1)} className="btn-secondary btn-sm" rel="prev">
                <Prev size={16} /> {t(lang, "rv_prev")}
              </Link>
            ) : (
              <span className="btn-secondary btn-sm pointer-events-none opacity-40">
                <Prev size={16} /> {t(lang, "rv_prev")}
              </span>
            )}
            <span className="num text-sm text-slate-500">{t(lang, "rv_pageOf", { p: res.page, n: res.pages })}</span>
            {res.page < res.pages ? (
              <Link href={href(base, res.page + 1)} className="btn-secondary btn-sm" rel="next">
                {t(lang, "rv_next")} <Next size={16} />
              </Link>
            ) : (
              <span className="btn-secondary btn-sm pointer-events-none opacity-40">
                {t(lang, "rv_next")} <Next size={16} />
              </span>
            )}
          </nav>
        )}

        <p className="mt-10 text-center text-sm">
          <Link href="/new" className="font-semibold text-brand-700 hover:underline">
            {t(lang, "rv_forDoctors")}
          </Link>
        </p>
      </div>
    </div>
  );
}
