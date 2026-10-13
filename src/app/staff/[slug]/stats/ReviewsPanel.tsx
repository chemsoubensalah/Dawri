import Link from "next/link";
import { Eye, EyeOff, MessageSquareQuote, Star } from "lucide-react";
import type { Lang } from "@/lib/domain/types";
import { t, tn } from "@/lib/i18n";
import type { StaffReviews } from "@/lib/server/reviews";
import { Empty } from "@/components/ui";
import HideToggle from "./HideToggle";

function Stars({ n, size = 14 }: { n: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5" dir="ltr" aria-label={`${n}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} className={i <= Math.round(n) ? "fill-amber-400 text-amber-400" : "text-slate-200"} aria-hidden="true" />
      ))}
    </span>
  );
}

/** «آراء المرضى» في صفحة الإحصاءات: المعدّل، التوزيع، وآخر 20 تعليقاً (بلا أسماء). */
export default function ReviewsPanel({ lang, slug, data }: { lang: Lang; slug: string; data: StaffReviews }) {
  const fmt = new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ" : "fr-DZ", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Algiers",
    numberingSystem: "latn",
  });
  const max = Math.max(1, ...data.dist);
  return (
    <section className="card" id="reviews" data-testid="reviews-panel">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-bold">
            <MessageSquareQuote size={18} className="text-brand-600" /> {t(lang, "rv_statsTitle")}
          </h2>
          <p className="text-sm text-slate-500">{t(lang, "rv_statsSub")}</p>
        </div>
        <Link href={`/staff/${slug}/settings#reviews`} className="btn-ghost btn-sm text-slate-600">
          {data.settings.public ? <Eye size={15} /> : <EyeOff size={15} />}
          {data.settings.public ? t(lang, "rv_publicOn") : t(lang, "rv_publicOff")}
        </Link>
      </div>

      {data.count === 0 ? (
        <Empty icon={<Star size={36} />} title={t(lang, "rv_noReviews")} sub={t(lang, "rv_noReviewsSub")} />
      ) : (
        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,240px)_1fr]">
          <div>
            <div className="flex items-end gap-3">
              <span dir="ltr" className="num text-5xl leading-none font-bold text-ink" data-testid="reviews-avg">
                {data.avg?.toFixed(1)}
              </span>
              <div className="pb-1">
                <Stars n={data.avg ?? 0} size={16} />
                <div className="text-sm text-slate-500">{tn(lang, "rv_count", data.count)}</div>
              </div>
            </div>
            <ul className="mt-4 space-y-1.5">
              {data.dist.map((n, i) => {
                const stars = 5 - i;
                return (
                  <li key={stars} className="flex items-center gap-2 text-sm">
                    <span dir="ltr" className="num inline-flex w-7 items-center gap-0.5 text-slate-600">
                      {stars}
                      <Star size={11} className="fill-amber-400 text-amber-400" aria-hidden="true" />
                    </span>
                    <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(n / max) * 100}%` }} />
                    </span>
                    <span dir="ltr" className="num w-8 text-end text-xs text-slate-500">{n}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-600">{t(lang, "rv_comments")}</h3>
            {data.comments.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">{t(lang, "rv_noComments")}</p>
            ) : (
              <ul className="max-h-96 space-y-2 overflow-auto pe-1">
                {data.comments.map((c) => (
                  <li key={c.id} className={`rounded-2xl p-3.5 ring-1 ${c.hidden ? "bg-slate-50 ring-slate-200 opacity-60" : "bg-white ring-slate-200/80"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Stars n={c.rating} />
                        <span dir="ltr" className="num text-xs text-slate-400">{fmt.format(new Date(c.createdAt))}</span>
                        {c.hidden && <span className="chip bg-slate-200 text-slate-600">{t(lang, "rv_hiddenTag")}</span>}
                      </div>
                      <HideToggle lang={lang} slug={slug} id={c.id} hidden={c.hidden} />
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed break-words whitespace-pre-line text-slate-700" dir="auto">
                      {c.comment}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-slate-500">{t(lang, "rv_hideNote")}</p>
          </div>
        </div>
      )}
    </section>
  );
}
