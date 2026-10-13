import Link from "next/link";
import { Check } from "lucide-react";
import LangSwitch from "@/components/LangSwitch";
import { Logo } from "@/components/ui";
import { t, type DictKey } from "@/lib/i18n";
import { getLang } from "@/lib/server/http";
import SignupChoice from "./SignupChoice";

export const metadata = { title: "عيادة جديدة" };

export default async function NewShop() {
  const lang = await getLang();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-ink p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -top-32 h-96 w-96 rounded-full bg-brand-500/30 blur-3xl ltr:-left-24 rtl:-right-24" />
        <Link href="/" className="relative"><Logo size={36} invert /></Link>
        <div className="relative">
          <h1 className="text-4xl leading-tight font-bold">{t(lang, "nw_side")}</h1>
          <ul className="mt-8 space-y-4 text-lg text-slate-200">
            {(["nw_b1", "nw_b2", "nw_b3", "nw_b4"] as DictKey[]).map((k) => (
              <li key={k} className="flex items-center gap-3">
                <span className="inline-flex size-7 items-center justify-center rounded-full bg-brand-500/20 text-brand-300"><Check size={16} /></span>
                {t(lang, k)}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-slate-400">{t(lang, "privacy")}</p>
      </aside>
      <main className="bg-mesh flex min-h-dvh flex-col">
        <header className="flex items-center justify-between px-5 py-4">
          <Link href="/" className="lg:invisible"><Logo size={32} /></Link>
          <LangSwitch lang={lang} />
        </header>
        <div className="mx-auto w-full max-w-lg flex-1 px-4 pb-12">
          <h2 className="text-3xl font-bold">{t(lang, "newTitle")}</h2>
          <p className="mt-1 text-slate-600">{t(lang, "nw_sub")}</p>
          <SignupChoice lang={lang} needsCode={Boolean(process.env.SIGNUP_CODE)} />
          <p className="mt-6 text-center text-sm text-slate-600">
            {t(lang, "nw_haveClinic")}{" "}
            <Link href="/login" className="font-semibold text-brand-700 hover:underline">{t(lang, "l_login")}</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
