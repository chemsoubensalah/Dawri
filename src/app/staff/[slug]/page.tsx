import { notFound } from "next/navigation";
import StaffFrame from "@/components/StaffFrame";
import { drTitle } from "@/lib/i18n";
import { getDb } from "@/lib/server/db";
import { getLang, staffAccess } from "@/lib/server/http";
import * as repo from "@/lib/server/repo";
import { staffState } from "@/lib/server/service";
import { manualPayment } from "@/lib/server/billing";
import LoginForm from "./LoginForm";
import StaffDashboard from "./StaffDashboard";

export const metadata = { title: "الطابور", robots: { index: false } };

export default async function StaffPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await staffAccess(slug);
  const shop = access?.shop ?? null;
  if (!shop) {
    const exists = await repo.getShopBySlug(await getDb(), slug.toLowerCase());
    if (!exists) notFound();
    const lang = await getLang(exists.defaultLang);
    return <LoginForm lang={lang} slug={exists.slug} name={exists.name} look={exists.look} support={manualPayment().whatsapp} />;
  }
  const lang = await getLang(shop.defaultLang);
  return (
    <StaffFrame role={access?.role} lang={lang} slug={shop.slug} name={shop.name} doctor={drTitle(lang, shop.kind, shop.profile.doctorName)} look={shop.look} active="queue">
      <StaffDashboard lang={lang} slug={shop.slug} initial={await staffState(shop)} canManage={access?.role !== "assistant"} />
    </StaffFrame>
  );
}
