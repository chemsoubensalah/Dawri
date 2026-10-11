import { notFound } from "next/navigation";
import StaffFrame from "@/components/StaffFrame";
import { getDb } from "@/lib/server/db";
import { getLang, staffShop } from "@/lib/server/http";
import * as repo from "@/lib/server/repo";
import { staffState } from "@/lib/server/service";
import LoginForm from "./LoginForm";
import StaffDashboard from "./StaffDashboard";

export const metadata = { title: "الطابور", robots: { index: false } };

export default async function StaffPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await staffShop(slug);
  if (!shop) {
    const exists = await repo.getShopBySlug(await getDb(), slug.toLowerCase());
    if (!exists) notFound();
    const lang = await getLang(exists.defaultLang);
    return <LoginForm lang={lang} slug={exists.slug} name={exists.name} />;
  }
  const lang = await getLang(shop.defaultLang);
  return (
    <StaffFrame lang={lang} slug={shop.slug} name={shop.name} active="queue">
      <StaffDashboard lang={lang} slug={shop.slug} initial={await staffState(shop)} />
    </StaffFrame>
  );
}
