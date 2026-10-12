import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { DomainError, isDisplayStyle, isTheme } from "@/lib/domain/types";
import { baseUrl, getLang } from "@/lib/server/http";
import { publicShop } from "@/lib/server/service";
import DisplayClient from "./DisplayClient";

export const metadata = { title: "شاشة القاعة", robots: { index: false } };

/** شاشة القاعة (تلفاز أو هاتف قديم): الرقم الحالي فقط — لا أسماء. */
export default async function Display({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  // ?style=…&theme=… للمعاينة من الإعدادات قبل الحفظ
  const sp = await searchParams;
  const preview = {
    skin: isDisplayStyle(sp.style) ? sp.style : undefined,
    theme: isTheme(sp.theme) ? sp.theme : undefined,
  };
  try {
    const { shop, view } = await publicShop(slug);
    // صفحة عامّة ← رابط المرضى العادي (رمز الباب السرّي يبقى على الملصق المطبوع فقط)
    const url = `${await baseUrl()}/s/${shop.slug}`;
    const qr = await QRCode.toString(url, { type: "svg", margin: 0, color: { dark: "#0b1b2b", light: "#ffffff" } });
    return <DisplayClient lang={await getLang(shop.defaultLang)} initial={view} qr={qr} preview={preview} />;
  } catch (e) {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  }
}
