import Link from "next/link";
import LangSwitch from "@/components/LangSwitch";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/server/http";

export default async function Home() {
  const lang = await getLang();
  const showDemo = !process.env.DATABASE_URL || process.env.DAWRI_DEMO === "1";
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 p-5">
      <header className="flex items-center justify-between">
        <span className="text-3xl font-black text-brand-700">{t(lang, "appName")}</span>
        <LangSwitch lang={lang} />
      </header>
      <section className="card space-y-4">
        <h1 className="text-2xl font-extrabold leading-snug">{t(lang, "homeTitle")}</h1>
        <p className="text-lg text-slate-700">{t(lang, "homeP1")}</p>
        <p className="text-lg text-slate-700">{t(lang, "homeP2")}</p>
        <div className="rounded-2xl bg-brand-50 p-4 text-center">
          <div className="num text-5xl font-black text-brand-700">7</div>
          <div className="font-semibold text-brand-900">{t(lang, "aheadN", { n: 7 })}</div>
          <div className="text-slate-600">{t(lang, "etaAbout", { n: 50 })}</div>
        </div>
        <p className="font-semibold text-slate-800">{t(lang, "homeFree")}</p>
        <div className="flex flex-col gap-3">
          <Link href="/new" className="btn-primary">
            {t(lang, "homeCreate")}
          </Link>
          {showDemo && (
            <Link href="/s/demo" className="btn-secondary">
              {t(lang, "homeDemo")}
            </Link>
          )}
        </div>
      </section>
      <p className="text-center text-sm text-slate-500">{t(lang, "privacy")}</p>
    </main>
  );
}
