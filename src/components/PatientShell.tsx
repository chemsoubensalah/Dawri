import Link from "next/link";
import type { ReactNode } from "react";
import { DEFAULT_LOOK, type Lang, type ShopLook } from "@/lib/domain/types";
import { themeVars } from "@/lib/theme";
import { dirOf, t } from "@/lib/i18n";
import LangSwitch from "./LangSwitch";
import { Logo, LogoMark } from "./ui";

/** إطار صفحات المريض: خفيف جدّاً، عمود واحد مريح على الهاتف. */
export default function PatientShell({ lang, look = DEFAULT_LOOK, children }: { lang: Lang; look?: ShopLook; children: ReactNode }) {
  return (
    <div className="bg-mesh min-h-dvh" dir={dirOf(lang)} lang={lang} style={themeVars(look)}>
      <div className="mx-auto max-w-md px-4 pt-4 pb-10">
        <header className="mb-4 flex items-center justify-between">
          <Logo size={30} />
          <LangSwitch lang={lang} />
        </header>
        <div className="space-y-4">{children}</div>
        <footer className="mt-8 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <LogoMark size={14} /> {t(lang, "pt_powered")}{" "}
          <Link href="/" className="font-semibold text-slate-500 hover:text-brand-700">Dawri</Link>
        </footer>
      </div>
    </div>
  );
}
