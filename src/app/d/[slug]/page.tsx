import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { DomainError } from "@/lib/domain/types";
import { baseUrl, getLang } from "@/lib/server/http";
import { publicShop } from "@/lib/server/service";
import DisplayClient from "./DisplayClient";

export const metadata = { title: "شاشة القاعة", robots: { index: false } };

/** شاشة القاعة (تلفاز أو هاتف قديم): الرقم الحالي فقط — لا أسماء. */
export default async function Display({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const { shop, view } = await publicShop(slug);
    // الشاشة داخل العيادة: رمزها يحمل رمز الباب، فمن يأخذ رقماً منها يُسجَّل حاضراً
    const url = `${await baseUrl()}/s/${shop.slug}?c=${encodeURIComponent(shop.doorCode)}`;
    const qr = await QRCode.toString(url, { type: "svg", margin: 0, color: { dark: "#0b1b2b", light: "#ffffff" } });
    return <DisplayClient lang={await getLang(shop.defaultLang)} initial={view} qr={qr} />;
  } catch (e) {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  }
}
