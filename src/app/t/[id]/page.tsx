import { notFound } from "next/navigation";
import { DomainError } from "@/lib/domain/types";
import { getLang } from "@/lib/server/http";
import { ticketView } from "@/lib/server/service";
import PatientShell from "@/components/PatientShell";
import TicketClient from "./TicketClient";

export const metadata = { title: "دوري", robots: { index: false } };

export default async function TicketPage({
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
    view = await ticketView(id);
  } catch (e) {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  }
  const lang = await getLang(view.lang, sp.lang);
  return (
    <PatientShell lang={lang}>
      <TicketClient lang={lang} initial={view} />
    </PatientShell>
  );
}
