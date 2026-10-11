import { redirect } from "next/navigation";
import { getLang, staffShop } from "@/lib/server/http";
import SettingsForm from "./SettingsForm";

export const metadata = { title: "الإعدادات", robots: { index: false } };

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await staffShop(slug);
  if (!shop) redirect(`/staff/${slug}`);
  const lang = await getLang(shop.defaultLang);
  return (
    <SettingsForm
      lang={lang}
      slug={shop.slug}
      initial={{ name: shop.name, hours: shop.hours, settings: shop.settings, defaultLang: shop.defaultLang }}
    />
  );
}
