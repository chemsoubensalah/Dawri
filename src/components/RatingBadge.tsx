import { Star } from "lucide-react";
import type { Lang } from "@/lib/domain/types";
import { t } from "@/lib/i18n";

/** ★ 4.8 (23) — معدّل التقييمات العامّ. */
export default function RatingBadge({ lang, avg, count, className = "" }: { lang: Lang; avg: number; count: number; className?: string }) {
  const a = avg.toFixed(1);
  return (
    <span
      className={`chip bg-amber-50 text-amber-800 ring-1 ring-amber-200/70 ${className}`}
      aria-label={t(lang, "rv_ratingAria", { avg: a, n: count })}
      data-testid="rating-badge"
    >
      <Star size={13} className="fill-amber-400 text-amber-400" aria-hidden="true" />
      <span dir="ltr" className="num font-bold">{a}</span>
      <span dir="ltr" className="num text-amber-700/70">({count})</span>
    </span>
  );
}
