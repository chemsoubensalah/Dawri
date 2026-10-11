"use client";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import type { Lang } from "@/lib/domain/types";
import { t } from "@/lib/i18n";

export default function LangSwitch({ lang, className = "", dark = false }: { lang: Lang; className?: string; dark?: boolean }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
        dark ? "text-slate-200 ring-1 ring-white/20 hover:bg-white/10" : "bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
      } ${className}`}
      onClick={() => {
        const next = lang === "ar" ? "fr" : "ar";
        document.cookie = `lang=${next}; path=/; max-age=31536000; samesite=lax`;
        document.documentElement.lang = next;
        document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
        router.refresh();
      }}
    >
      <Languages size={16} aria-hidden="true" />
      {t(lang, "langSwitch")}
    </button>
  );
}
