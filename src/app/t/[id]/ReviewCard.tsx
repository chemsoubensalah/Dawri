"use client";
import { useEffect, useState } from "react";
import { ExternalLink, Heart, Send, Star } from "lucide-react";
import type { Lang } from "@/lib/domain/types";
import { errorText, t, type DictKey } from "@/lib/i18n";
import { api, ApiError } from "@/lib/client";
import type { ReviewState } from "@/lib/server/reviews";

const MAX = 300;

/** «كيف كانت تجربتك؟» — يظهر بعد انتهاء الزيارة فقط، مرّة واحدة لكلّ تذكرة. */
export default function ReviewCard({ lang, ticketId }: { lang: Lang; ticketId: string }) {
  const [st, setSt] = useState<ReviewState | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<ReviewState>(`/api/t/${ticketId}/review`)
      .then((s) => alive && setSt(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ticketId]);

  if (!st || st.state === "none") return null;

  const send = async () => {
    if (!rating) return setErr(errorText(lang, "review_invalid"));
    setBusy(true);
    setErr(null);
    try {
      // إعادة الإرسال تُرجع التقييم المحفوظ
      const r = await api<{ ok: boolean; rating?: number }>(`/api/t/${ticketId}/review`, { rating, comment: comment.trim() || null });
      setSt({ state: "sent", rating: r.rating ?? rating, mapsUrl: st.mapsUrl });
    } catch (e) {
      const code = (e as ApiError).code;
      if (code === "review_exists") {
        // أُرسل تقييم مختلف من قبل (جهاز آخر): نعرض المحفوظ مع رابط Google
        const saved = await api<ReviewState>(`/api/t/${ticketId}/review`).catch(() => null);
        setSt(saved?.state === "sent" ? saved : { state: "sent", rating, mapsUrl: st.mapsUrl });
      } else setErr(errorText(lang, code));
    } finally {
      setBusy(false);
    }
  };

  if (st.state === "sent") {
    return (
      <section className="card space-y-3 text-center" data-testid="review-thanks" aria-live="polite">
        <span className="mx-auto inline-flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
          <Heart size={24} />
        </span>
        <div>
          <h2 className="text-lg font-bold">{t(lang, "rv_thanks")}</h2>
          <p className="text-sm leading-relaxed text-slate-500">{t(lang, "rv_thanksSub")}</p>
        </div>
        {st.rating >= 4 && st.mapsUrl && (
          <div className="rounded-2xl bg-amber-50/70 p-3.5 ring-1 ring-amber-200/70">
            <a href={st.mapsUrl} target="_blank" rel="noopener noreferrer" className="btn-primary w-full" data-testid="review-google">
              <Star size={18} className="fill-current" /> {t(lang, "rv_google")} <ExternalLink size={15} />
            </a>
            <p className="mt-2 text-xs leading-relaxed text-amber-900/80">{t(lang, "rv_googleSub")}</p>
          </div>
        )}
      </section>
    );
  }

  const shown = rating;
  return (
    <section className="card space-y-4" data-testid="review-card">
      <div className="text-center">
        <h2 className="text-lg font-bold">{t(lang, "rv_title")}</h2>
        <p className="text-sm leading-relaxed text-slate-500">{t(lang, "rv_sub")}</p>
      </div>
      <div className="flex justify-center gap-1" role="radiogroup" aria-label={t(lang, "rv_title")} dir="ltr">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={t(lang, "rv_starOf", { n })}
            data-testid={`star-${n}`}
            onClick={() => {
              setRating(n);
              setErr(null);
            }}
            className="rounded-xl p-1.5 transition active:scale-90"
          >
            <Star
              size={42}
              strokeWidth={1.6}
              className={n <= shown ? "fill-amber-400 text-amber-400 drop-shadow-sm" : "text-slate-300"}
            />
          </button>
        ))}
      </div>
      <p className="h-5 text-center text-sm font-semibold text-amber-700">{rating ? t(lang, `rv_s${rating}` as DictKey) : ""}</p>
      {rating > 0 && (
        <div>
          <textarea
            className="input min-h-24 leading-relaxed"
            maxLength={MAX}
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, MAX))}
            placeholder={t(lang, "rv_commentPh")}
            aria-label={t(lang, "rv_commentPh")}
          />
          <div className="mt-1 text-end text-xs text-slate-400">
            <span dir="ltr" className="num">{comment.length}/{MAX}</span>
          </div>
        </div>
      )}
      {err && <p className="text-center text-sm font-semibold text-rose-700" role="alert">{err}</p>}
      <button className="btn-primary w-full" onClick={send} disabled={busy || !rating} data-testid="review-send">
        <Send size={18} /> {t(lang, "rv_send")}
      </button>
      <p className="text-center text-xs text-slate-400">{t(lang, "rv_leftH", { n: st.leftH })}</p>
    </section>
  );
}
