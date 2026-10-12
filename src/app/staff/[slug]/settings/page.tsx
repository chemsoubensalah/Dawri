import { redirect } from "next/navigation";
import StaffFrame from "@/components/StaffFrame";
import { drTitle } from "@/lib/i18n";
import { getLang, ownerShop } from "@/lib/server/http";
import { channelStatus } from "@/lib/server/channels";
import { withClinicSms } from "@/lib/server/smsgate";
import SettingsForm from "./SettingsForm";

export const metadata = { title: "الإعدادات", robots: { index: false } };

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await ownerShop(slug);
  if (!shop) redirect(`/staff/${slug}`);
  const lang = await getLang(shop.defaultLang);
  return (
    <StaffFrame lang={lang} slug={shop.slug} name={shop.name} doctor={drTitle(lang, shop.kind, shop.profile.doctorName)} look={shop.look} active="settings">
      <SettingsForm
        lang={lang}
        slug={shop.slug}
        channels={await withClinicSms(channelStatus(), shop.id)}
        initial={{
          name: shop.name,
          hours: shop.hours,
          settings: shop.settings,
          defaultLang: shop.defaultLang,
          profile: shop.profile,
          look: shop.look,
          email: shop.ownerEmail,
        }}
      />
    </StaffFrame>
  );
}
