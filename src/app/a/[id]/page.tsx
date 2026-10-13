import { notFound } from "next/navigation";
import { DomainError } from "@/lib/domain/types";
import { getLang } from "@/lib/server/http";
import { appointmentView } from "@/lib/server/appointments";
import PatientShell from "@/components/PatientShell";
import AppointmentClient from "./AppointmentClient";

export const metadata = { title: "دوري — موعد", robots: { index: false } };

/** صفحة الموعد: رابط خاصّ (uuid عشوائي) يدير به المريض موعده. ?c= = رمز الباب (حضور مؤكَّد). */
export default async function AppointmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  let view;
  try {
    view = await appointmentView(id);
  } catch (e) {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  }
  const lang = await getLang(view.lang, sp.lang);
  return (
    <PatientShell lang={lang} look={view.shop.look}>
      <AppointmentClient lang={lang} initial={view} door={sp.c ?? null} />
    </PatientShell>
  );
}
