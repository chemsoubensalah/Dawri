import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DomainError } from "@/lib/domain/types";
import { getLang } from "@/lib/server/http";
import { publicShop } from "@/lib/server/service";
import { bookingTeaser } from "@/lib/server/appointments";
import PatientShell from "@/components/PatientShell";
import ShopClient from "./ShopClient";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

// cache: العنوان والصفحة يشتركان في استعلام واحد لقاعدة البيانات
const load = cache(async (slug: string) => {
  try {
    return await publicShop(slug);
  } catch (e) {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { shop } = await load(slug);
  return { title: shop.name };
}

export default async function ShopPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const { shop, view } = await load(slug);
  const lang = await getLang(shop.defaultLang, sp.lang);
  // «احجز موعداً» إن فعّلته العيادة (خطأ هنا لا يُسقط صفحة أخذ الرقم)
  const booking = await bookingTeaser(shop).catch((e) => (console.error("[booking]", e), null));
  return (
    <PatientShell lang={lang} look={shop.look}>
      <ShopClient lang={lang} initial={view} door={sp.c ?? null} booking={booking} />
    </PatientShell>
  );
}
