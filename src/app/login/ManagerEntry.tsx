"use client";
import { useEffect, useState } from "react";
import { Building, ChevronDown } from "lucide-react";
import type { Lang } from "@/lib/domain/types";
import { t } from "@/lib/i18n";

/** دخول مدير عيادة بعدّة أطبّاء (/c/<slug>/manage). يتذكّر آخر العيادات على هذا الجهاز. */
export default function ManagerEntry({ lang }: { lang: Lang }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    try {
      const r = JSON.parse(localStorage.getItem("dawri:clinics") ?? "[]") as string[];
      setRecent(r);
      if (r.length) setOpen(true);
    } catch {}
  }, []);
  return (
    <div className="border-t border-slate-100 pt-4">
      <button type="button" className="flex w-full items-center justify-between gap-2 text-sm font-semibold text-slate-600 hover:text-ink" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="flex items-center gap-2"><Building size={16} /> {t(lang, "cl_loginManager")}</span>
        <ChevronDown size={16} className={open ? "rotate-180" : ""} />
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {recent.map((s) => (
            <a key={s} href={`/c/${s}/manage`} className="flex items-center gap-3 rounded-2xl p-3 ring-1 ring-slate-200 transition hover:bg-slate-50">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Building size={20} /></span>
              <span className="font-semibold" dir="ltr">{s}</span>
            </a>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const s = slug.trim().toLowerCase();
              if (s) location.href = `/c/${encodeURIComponent(s)}/manage`;
            }}
          >
            <div className="flex flex-1 items-center rounded-2xl border border-slate-200 bg-white focus-within:border-brand-500" dir="ltr">
              <span className="ps-3 text-sm text-slate-400">/c/</span>
              <input
                className="w-full bg-transparent px-1 py-2.5 outline-none"
                placeholder="clinique-ennour"
                aria-label={t(lang, "cl_clinicSlug")}
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                autoCapitalize="none"
                required
              />
            </div>
            <button className="btn-secondary">{t(lang, "login")}</button>
          </form>
        </div>
      )}
    </div>
  );
}
