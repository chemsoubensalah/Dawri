import { notFound } from "next/navigation";
import { activeReasonConfig, reasonConfigOf } from "@/lib/domain/reasons";
import type { Metadata } from "next";
import { DomainError } from "@/lib/domain/types";
import { t } from "@/lib/i18n";
import { getDb } from "@/lib/server/db";
import { getLang } from "@/lib/server/http";
import * as repo from "@/lib/server/repo";
import { publicAvailability, type PublicAvailability } from "@/lib/server/appointments";
import PatientShell from "@/components/PatientShell";
import BookClient from "./BookClient";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

async function loadShop(slug: string) {
  const shop = await repo.getShopBySlug(await getDb(), slug.toLowerCase());
  if (!shop) notFound();
  return shop;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const shop = await loadShop(slug);
  return { title: `${t(shop.defaultLang, "ap_bookTitle")} — ${shop.name}` };
}

/** «احجز موعداً»: الأيّام ثمّ الساعات ثمّ الاسم والهاتف. */
export default async function BookPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const shop = await loadShop(slug);
  const lang = await getLang(shop.defaultLang, sp.lang);
  let initial: PublicAvailability | null = null;
  let error: string | null = null;
  try {
    initial = await publicAvailability(shop.slug);
  } catch (e) {
    if (!(e instanceof DomainError)) throw e;
    error = e.code;
  }
  return (
    <PatientShell lang={lang} look={shop.look}>
      <BookClient
        lang={lang}
        slug={shop.slug}
        shop={{ name: shop.name, kind: shop.kind, profile: shop.profile, reason: activeReasonConfig(reasonConfigOf(shop)) }}
        initial={initial}
        error={error}
      />
    </PatientShell>
  );
}
