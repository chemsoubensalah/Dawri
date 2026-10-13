import { redirect } from "next/navigation";
import StaffFrame from "@/components/StaffFrame";
import { drTitle } from "@/lib/i18n";
import { getLang, staffAccess } from "@/lib/server/http";
import { staffAppointments } from "@/lib/server/appointments";
import AppointmentsBoard from "./AppointmentsBoard";

export const metadata = { title: "المواعيد", robots: { index: false } };

export default async function AppointmentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await staffAccess(slug);
  const shop = access?.shop;
  if (!shop) redirect(`/staff/${slug}`);
  const lang = await getLang(shop.defaultLang);
  return (
    <StaffFrame role={access?.role} lang={lang} slug={shop.slug} name={shop.name} doctor={drTitle(lang, shop.kind, shop.profile.doctorName)} look={shop.look} active="appointments">
      <AppointmentsBoard lang={lang} slug={shop.slug} initial={await staffAppointments(shop, "upcoming")} />
    </StaffFrame>
  );
}
