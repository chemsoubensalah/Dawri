import Link from "next/link";
import LangSwitch from "./LangSwitch";
import { Logo } from "./ui";
import type { Lang } from "@/lib/domain/types";
import { dirOf } from "@/lib/i18n";

export type LegalSection = { h: string; p: (string | string[])[] };

/** قالب صفحات الخصوصية والشروط: نصّ مقروء، عمود واحد. */
export default function LegalPage({ lang, title, updated, intro, sections }: { lang: Lang; title: string; updated: string; intro: string; sections: LegalSection[] }) {
  return (
    <div className="bg-mesh min-h-dvh" dir={dirOf(lang)} lang={lang}>
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
        <Link href="/"><Logo size={32} /></Link>
        <LangSwitch lang={lang} />
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16">
        <article className="card p-6 sm:p-10">
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{updated}</p>
          <p className="mt-6 leading-loose text-slate-700">{intro}</p>
          {sections.map((s) => (
            <section key={s.h} className="mt-8">
              <h2 className="text-xl font-bold text-ink">{s.h}</h2>
              {s.p.map((x, i) =>
                Array.isArray(x) ? (
                  <ul key={i} className="mt-3 list-disc space-y-1.5 ps-6 leading-relaxed text-slate-700">
                    {x.map((li) => <li key={li}>{li}</li>)}
                  </ul>
                ) : (
                  <p key={i} className="mt-3 leading-loose text-slate-700">{x}</p>
                ),
              )}
            </section>
          ))}
        </article>
        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/privacy" className="hover:text-ink">{lang === "ar" ? "سياسة الخصوصية" : "Confidentialité"}</Link>
          {" · "}
          <Link href="/terms" className="hover:text-ink">{lang === "ar" ? "شروط الاستعمال" : "Conditions d'utilisation"}</Link>
        </p>
      </main>
    </div>
  );
}
