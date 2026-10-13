import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { DomainError } from "@/lib/domain/types";
import { baseUrl, getLang } from "@/lib/server/http";
import { clinicPublic } from "@/lib/server/clinics";
import ClinicTv from "./ClinicTv";

export const metadata = { title: "شاشة القاعة", robots: { index: false } };

/** شاشة قاعة مشتركة لكلّ أطبّاء العيادة: أرقام فقط — أبداً أسماء المرضى. */
export default async function ClinicTvPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  try {
    const view = await clinicPublic(slug);
    const url = `${await baseUrl()}/c/${view.clinic.slug}`;
    const qr = await QRCode.toString(url, { type: "svg", margin: 0, color: { dark: "#0b1b2b", light: "#ffffff" } });
    return <ClinicTv lang={await getLang(undefined, sp.lang)} initial={view} qr={qr} />;
  } catch (e) {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  }
}
