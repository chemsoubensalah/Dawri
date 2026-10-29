"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck2, ChevronLeft, ChevronRight, Ticket } from "lucide-react";
import { fmtDay } from "@/lib/domain/appointments";
import { OPEN_STATUSES, type Lang } from "@/lib/domain/types";
import { t } from "@/lib/i18n";
import { api, savedTicketsToday } from "@/lib/client";
import { allSavedAppts } from "@/lib/appointments-client";
import type { TicketView } from "@/lib/server/service";
import type { AppointmentView } from "@/lib/server/appointments";

type Item = { key: string; href: string; shop: string; kind: "ticket" | "appt"; value: string };

/**
 * «على هذا الهاتف»: رقم اليوم والمواعيد القادمة المحفوظة محلّياً (كلّ العيادات).
 * في الصفحة الرئيسية ودليل الأطبّاء: من خرج من صفحته وعاد إلى الموقع يجد ما تركه.
 */
export default function MyVisits({ lang, className = "" }: { lang: Lang; className?: string }) {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    const tickets = savedTicketsToday()
      .slice(0, 3)
      .map((x) =>
        api<TicketView>(`/api/t/${x.id}`)
          .then((v): Item | null =>
            OPEN_STATUSES.includes(v.status as (typeof OPEN_STATUSES)[number])
              ? { key: v.id, href: `/t/${v.id}`, shop: v.shop.name, kind: "ticket", value: String(v.number) }
              : null,
          )
          .catch(() => null),
      );
    const appts = allSavedAppts()
      .slice(0, 3)
      .map((x) =>
        api<AppointmentView>(`/api/a/${x.id}`)
          .then((v): Item | null =>
            v.status === "booked" ? { key: v.id, href: `/a/${v.id}`, shop: v.shop.name, kind: "appt", value: `${fmtDay(lang, v.day)} · ${v.time}` } : null,
          )
          .catch(() => null),
      );
    Promise.all([...tickets, ...appts]).then((r) => setItems(r.filter((x): x is Item => x !== null)));
  }, [lang]);

  if (!items.length) return null;
  const Chevron = lang === "ar" ? ChevronLeft : ChevronRight;
  return (
    <section className={className} aria-label={t(lang, "mv_title")} data-testid="my-visits">
      <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500">{t(lang, "mv_title")}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((it) => (
          <Link
            key={it.key}
            href={it.href}
            className="flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm ring-2 ring-brand-500 transition hover:bg-brand-50"
          >
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
              {it.kind === "ticket" ? <Ticket size={22} /> : <CalendarCheck2 size={22} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-brand-700">
                {t(lang, it.kind === "ticket" ? "mv_ticket" : "mv_appt")} · {it.shop}
              </span>
              <span className={`block truncate font-bold text-ink ${it.kind === "ticket" ? "num text-2xl" : ""}`}>{it.value}</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700">
              {t(lang, "mv_open")} <Chevron size={16} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
