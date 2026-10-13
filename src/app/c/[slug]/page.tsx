import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DomainError } from "@/lib/domain/types";
import { getLang } from "@/lib/server/http";
import { clinicPublic } from "@/lib/server/clinics";
import PatientShell from "@/components/PatientShell";
import ClinicClient from "./ClinicClient";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

const load = cache(async (slug: string) => {
  try {
    return await clinicPublic(slug);
  } catch (e) {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: (await load(slug)).clinic.name };
}

/** صفحة العيادة للمرضى: كلّ الأطبّاء وحالتهم، ثمّ «خذ رقماً» عند الطبيب المختار. */
export default async function ClinicPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const view = await load(slug);
  const lang = await getLang(undefined, sp.lang);
  return (
    <PatientShell lang={lang} look={view.clinic.look}>
      <ClinicClient lang={lang} initial={view} />
    </PatientShell>
  );
}
