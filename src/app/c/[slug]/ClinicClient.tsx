"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, DoorOpen, MapPin, Phone, Ticket, Users } from "lucide-react";
import type { Lang } from "@/lib/domain/types";
import { drTitle, t, tn } from "@/lib/i18n";
import { api, usePoll } from "@/lib/client";
import type { ClinicPublicView } from "@/lib/server/clinics";
import { StatusBadge } from "./status";

/** صفحة العيادة للمرضى: بطاقة لكلّ طبيب (حالته، الرقم الحالي، الانتظار التقريبي). */
export default function ClinicClient({ lang, initial }: { lang: Lang; initial: ClinicPublicView }) {
  const [view, setView] = useState(initial);
  usePoll(async () => setView(await api<ClinicPublicView>(`/api/c/${initial.clinic.slug}`)), 10_000);
  const { clinic, doctors } = view;

  return (
    <>
      <section className="card overflow-hidden">
        <div className="bg-gradient-to-br from-brand-600 to-brand-800 px-5 py-6 text-white">
          <p className="text-sm font-semibold text-brand-100">{t(lang, "cl_clinicTag")}</p>
          <h1 className="mt-1 text-2xl leading-snug font-bold">{clinic.name}</h1>
          <p className="mt-1 text-sm text-brand-100">{tn(lang, "cl_doctorsN", doctors.length)}</p>
        </div>
        {(clinic.address || clinic.phone || clinic.mapsUrl) && (
          <div className="space-y-2 px-5 py-4 text-sm leading-relaxed text-slate-700">
            {clinic.address && (
              <p className="flex items-start gap-2">
                <MapPin size={16} className="mt-0.5 shrink-0 text-brand-700" />
                {clinic.mapsUrl ? (
                  <a href={clinic.mapsUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{clinic.address}</a>
                ) : (
                  clinic.address
                )}
              </p>
            )}
            {clinic.phone && (
              <p className="flex items-center gap-2">
                <Phone size={16} className="shrink-0 text-brand-700" />
                <a href={`tel:${clinic.phone.replace(/\s/g, "")}`} className="num hover:underline" dir="ltr">{clinic.phone}</a>
              </p>
            )}
          </div>
        )}
      </section>

      <h2 className="px-1 pt-1 text-lg font-bold">{t(lang, "cl_chooseDoctor")}</h2>

      {doctors.length === 0 ? (
        <p className="card p-6 text-center text-slate-500">{t(lang, "cl_noDoctors")}</p>
      ) : (
        <ul className="space-y-3">
          {doctors.map((d) => {
            const title = drTitle(lang, d.kind, d.doctorName) ?? d.name;
            const canTake = d.status === "open" || d.status === "break" || d.status === "later";
            return (
              <li key={d.slug} className="card p-4" data-testid="clinic-doctor">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 leading-relaxed">
                    <p className="truncate text-lg font-bold text-ink">{title}</p>
                    <p className="text-sm text-slate-500">
                      {[d.specialty, d.room].filter(Boolean).join(" · ") || " "}
                    </p>
                  </div>
                  <StatusBadge lang={lang} status={d.status} resumesAt={d.resumesAt} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-brand-50 p-2">
                    <p className="text-xs text-brand-800">{t(lang, "cl_now")}</p>
                    <p className="num text-2xl font-bold text-brand-700" dir="ltr">{d.currentNumber ?? "—"}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2">
                    <p className="flex items-center justify-center gap-1 text-xs text-slate-500"><Users size={12} /> {t(lang, "cl_waiting")}</p>
                    <p className="num text-2xl font-bold text-ink" dir="ltr">{d.waiting}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2">
                    <p className="text-xs text-slate-500">{t(lang, "cl_wait")}</p>
                    <p className="text-lg leading-8 font-bold text-ink">
                      {d.status === "open" ? (
                        <span dir="ltr" className="num">≈ {d.waitNewMin} {t(lang, "cl_min")}</span>
                      ) : (
                        "—"
                      )}
                    </p>
                  </div>
                </div>
                {canTake ? (
                  <Link href={`/s/${d.slug}`} className="btn-primary mt-3 w-full" data-testid="take-at-doctor">
                    <Ticket size={18} /> {t(lang, "cl_take")}
                    <ChevronLeft size={16} className="ltr:rotate-180" />
                  </Link>
                ) : (
                  <p className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
                    <DoorOpen size={16} /> {t(lang, d.status === "inactive" ? "cl_unavailable" : "cl_closedToday")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="px-1 text-center text-xs leading-relaxed text-slate-400">{t(lang, "cl_privacyNote")}</p>
    </>
  );
}
