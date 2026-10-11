import { notFound } from "next/navigation";
import { DomainError } from "@/lib/domain/types";
import { getLang } from "@/lib/server/http";
import { publicShop } from "@/lib/server/service";
import DisplayClient from "./DisplayClient";

export const metadata = { title: "شاشة القاعة", robots: { index: false } };

/** شاشة القاعة (تلفاز أو هاتف قديم): الرقم الحالي فقط — لا أسماء. */
export default async function Display({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const { shop, view } = await publicShop(slug);
    return <DisplayClient lang={await getLang(shop.defaultLang)} initial={view} />;
  } catch (e) {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  }
}
