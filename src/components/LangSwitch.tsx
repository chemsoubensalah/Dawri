"use client";
import { useRouter } from "next/navigation";
import type { Lang } from "@/lib/domain/types";
import { t } from "@/lib/i18n";

export default function LangSwitch({ lang, className = "" }: { lang: Lang; className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={`rounded-full px-3 py-1 text-sm font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-white ${className}`}
      onClick={() => {
        const next = lang === "ar" ? "fr" : "ar";
        document.cookie = `lang=${next}; path=/; max-age=31536000; samesite=lax`;
        document.documentElement.lang = next;
        document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
        router.refresh();
      }}
    >
      {t(lang, "langSwitch")}
    </button>
  );
}
