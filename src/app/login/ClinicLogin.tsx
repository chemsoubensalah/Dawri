"use client";
import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import type { Lang } from "@/lib/domain/types";
import { t } from "@/lib/i18n";

/** يطلب الرابط القصير للعيادة ثمّ يفتح شاشة السكرتيرة. يتذكّر آخر عيادة على هذا الجهاز. */
export default function ClinicLogin({ lang }: { lang: Lang }) {
  const [slug, setSlug] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem("dawri:staffShops") ?? "[]"));
    } catch {}
  }, []);
  return (
    <div className="mt-6 space-y-4">
      {recent.length > 0 && (
        <div className="space-y-2">
          {recent.map((s) => (
            <a key={s} href={`/staff/${s}`} className="flex items-center gap-3 rounded-2xl p-3 ring-1 ring-slate-200 transition hover:bg-slate-50">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Building2 size={20} /></span>
              <span className="font-semibold" dir="ltr">{s}</span>
            </a>
          ))}
        </div>
      )}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const s = slug.trim().toLowerCase();
          if (s) location.href = `/staff/${encodeURIComponent(s)}`;
        }}
      >
        <label className="label" htmlFor="slug">{t(lang, "lg_slug")}</label>
        <div className="flex items-center rounded-2xl border border-slate-200 bg-white shadow-sm focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100" dir="ltr">
          <span className="ps-4 text-sm text-slate-400">/staff/</span>
          <input
            id="slug"
            className="w-full bg-transparent px-1 py-3 outline-none"
            placeholder="dr-benali"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            autoCapitalize="none"
            required
          />
        </div>
        <button className="btn-primary w-full">{t(lang, "login")}</button>
      </form>
    </div>
  );
}
