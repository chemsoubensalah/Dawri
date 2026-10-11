import { redirect } from "next/navigation";
import StaffFrame from "@/components/StaffFrame";
import { getLang, staffShop } from "@/lib/server/http";
import { channelStatus } from "@/lib/server/channels";
import SettingsForm from "./SettingsForm";

export const metadata = { title: "الإعدادات", robots: { index: false } };

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await staffShop(slug);
  if (!shop) redirect(`/staff/${slug}`);
  const lang = await getLang(shop.defaultLang);
  return (
    <StaffFrame lang={lang} slug={shop.slug} name={shop.name} active="settings">
      <SettingsForm
        lang={lang}
        slug={shop.slug}
        channels={channelStatus()}
        initial={{
          name: shop.name,
          hours: shop.hours,
          settings: shop.settings,
          defaultLang: shop.defaultLang,
          profile: shop.profile,
        }}
      />
    </StaffFrame>
  );
}
