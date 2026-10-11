import Link from "next/link";
import LangSwitch from "@/components/LangSwitch";
import { Logo } from "@/components/ui";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/server/http";
import ClinicLogin from "./ClinicLogin";

export const metadata = { title: "دخول العيادة" };

export default async function LoginPage() {
  const lang = await getLang();
  return (
    <div className="bg-mesh flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/"><Logo size={32} /></Link>
        <LangSwitch lang={lang} />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16">
        <div className="card p-7">
          <h1 className="text-2xl font-bold">{t(lang, "l_login")}</h1>
          <p className="mt-1 text-slate-600">{t(lang, "lg_sub")}</p>
          <ClinicLogin lang={lang} />
        </div>
        <p className="mt-6 text-center text-sm text-slate-600">
          {t(lang, "lg_noClinic")}{" "}
          <Link href="/new" className="font-semibold text-brand-700 hover:underline">{t(lang, "l_startFree")}</Link>
        </p>
      </main>
    </div>
  );
}
