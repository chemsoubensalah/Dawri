import Link from "next/link";
import { BarChart3, CreditCard, LayoutList, MonitorPlay, QrCode, Settings } from "lucide-react";
import type { ReactNode } from "react";
import LangSwitch from "./LangSwitch";
import LogoutButton from "./LogoutButton";
import { LogoMark } from "./ui";
import type { Lang } from "@/lib/domain/types";
import { dirOf, t, type DictKey } from "@/lib/i18n";

export type StaffTab = "queue" | "stats" | "qr" | "settings" | "billing" | "welcome";

const TABS: { key: StaffTab | "display"; label: DictKey; href: (s: string) => string; icon: ReactNode; external?: boolean }[] = [
  { key: "queue", label: "nav_queue", href: (s) => `/staff/${s}`, icon: <LayoutList size={17} /> },
  { key: "stats", label: "nav_stats", href: (s) => `/staff/${s}/stats`, icon: <BarChart3 size={17} /> },
  { key: "qr", label: "nav_poster", href: (s) => `/staff/${s}/qr`, icon: <QrCode size={17} /> },
  { key: "display", label: "display", href: (s) => `/d/${s}`, icon: <MonitorPlay size={17} />, external: true },
  { key: "settings", label: "settings", href: (s) => `/staff/${s}/settings`, icon: <Settings size={17} /> },
  { key: "billing", label: "nav_billing", href: (s) => `/staff/${s}/billing`, icon: <CreditCard size={17} /> },
];

/** الإطار المشترك لصفحات العيادة: شريط علوي + تبويبات. */
export default function StaffFrame({
  lang,
  slug,
  name,
  doctor,
  active,
  actions,
  children,
}: {
  lang: Lang;
  slug: string;
  name: string;
  /** اسم الطبيب كما يُعرض (بعد drTitle). */
  doctor?: string | null;
  active: StaffTab;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[#f3f5f8]" dir={dirOf(lang)} lang={lang}>
      <header className="no-print sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 pt-3 sm:px-5">
          <Link href={`/staff/${slug}`} className="flex min-w-0 items-center gap-2.5">
            <LogoMark size={34} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-bold text-ink">{name}</span>
              {doctor ? (
                <span className="block truncate text-sm font-semibold text-brand-700">{doctor}</span>
              ) : (
                <span className="block text-xs text-slate-500">{t(lang, "nav_space")}</span>
              )}
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <LangSwitch lang={lang} className="hidden sm:inline-flex" />
            <LogoutButton slug={slug} label={t(lang, "logout")} />
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 pt-2 sm:px-4" aria-label={t(lang, "nav_space")}>
          {TABS.map((tab) => {
            const on = tab.key === active;
            return (
              <Link
                key={tab.key}
                href={tab.href(slug)}
                target={tab.external ? "_blank" : undefined}
                aria-current={on ? "page" : undefined}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 pt-1.5 pb-2.5 text-sm font-semibold transition ${
                  on ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-ink"
                }`}
              >
                {tab.icon}
                {t(lang, tab.label)}
              </Link>
            );
          })}
          <LangSwitch lang={lang} className="my-1 ms-auto shrink-0 sm:hidden" />
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-3 py-5 sm:px-5 sm:py-7">{children}</main>
    </div>
  );
}
