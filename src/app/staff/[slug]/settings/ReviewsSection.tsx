"use client";
import { useEffect, useState } from "react";
import { ExternalLink, Info, Save, Star } from "lucide-react";
import type { Lang } from "@/lib/domain/types";
import { errorText, t, type DictKey } from "@/lib/i18n";
import { api, ApiError } from "@/lib/client";

type S = { public: boolean; listed: boolean; wilaya?: number | null };

/** «التقييمات والدليل»: قسم مستقلّ بحالته وواجهته وزرّ حفظه (داخل نموذج الإعدادات). */
export default function ReviewsSection({ lang, slug }: { lang: Lang; slug: string }) {
  const [s, setS] = useState<S | null>(null);
  const [saved, setSaved] = useState<S | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<S>(`/api/staff/${slug}/reviews`)
      .then((v) => {
        setS(v);
        setSaved(v);
      })
      .catch((e) => setMsg({ ok: false, text: errorText(lang, (e as ApiError).code) }));
  }, [slug, lang]);

  const save = async () => {
    if (!s) return;
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/staff/${slug}/reviews`, { public: s.public, listed: s.listed });
      setSaved(s);
      setMsg({ ok: true, text: t(lang, "saved") });
    } catch (e) {
      setMsg({ ok: false, text: errorText(lang, (e as ApiError).code) });
    } finally {
      setBusy(false);
    }
  };

  const dirty = s && saved && (s.public !== saved.public || s.listed !== saved.listed);

  const toggle = (k: "public" | "listed", label: DictKey, hint: DictKey) => (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={Boolean(s?.[k])}
          disabled={!s}
          onChange={(e) => setS((v) => (v ? { ...v, [k]: e.target.checked } : v))}
          data-testid={`rv-${k}`}
        />
        <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400" />
        <span className="absolute start-0.5 top-0.5 size-5 rounded-full bg-white shadow transition peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5" />
      </span>
      <span>
        <span className="block font-semibold text-ink">{t(lang, label)}</span>
        <span className="block text-sm leading-relaxed text-slate-500">{t(lang, hint)}</span>
      </span>
    </label>
  );

  return (
    <section id="reviews" className="card scroll-mt-28 p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <Star size={20} />
        </span>
        <div>
          <h2 className="text-lg font-bold">{t(lang, "rv_se")}</h2>
          <p className="text-sm text-slate-500">{t(lang, "rv_seSub")}</p>
        </div>
      </div>
      <div className="space-y-3">
        {toggle("public", "rv_public", "rv_publicHint")}
        {toggle("listed", "rv_listed", "rv_listedHint")}
        {s?.listed && !s.wilaya && (
          <p className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200/70">
            <Info size={16} className="mt-0.5 shrink-0" /> {t(lang, "rv_wilayaTip")}
          </p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        {msg && (
          <p className={`me-auto text-sm font-semibold ${msg.ok ? "text-brand-700" : "text-rose-700"}`} role="status">
            {msg.text}
          </p>
        )}
        <a href="/doctors" target="_blank" rel="noopener" className="btn-ghost btn-sm">
          <ExternalLink size={15} /> {t(lang, "rv_seeDir")}
        </a>
        <button type="button" className="btn-secondary btn-sm" onClick={save} disabled={busy || !dirty} data-testid="rv-save">
          <Save size={15} /> {t(lang, "save")}
        </button>
      </div>
    </section>
  );
}
