import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DomainError } from "@/lib/domain/types";
import { getLang } from "@/lib/server/http";
import { publicShop } from "@/lib/server/service";
import PatientShell from "@/components/PatientShell";
import ShopClient from "./ShopClient";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

async function load(slug: string) {
  try {
    return await publicShop(slug);
  } catch (e) {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  }
}

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
  return (
    <PatientShell lang={lang} theme={shop.look.theme}>
      <ShopClient lang={lang} initial={view} door={sp.c ?? null} />
    </PatientShell>
  );
}
