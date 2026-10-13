import { notFound } from "next/navigation";
import { getLang } from "@/lib/server/http";
import { clinicBySlug, managerClinic } from "@/lib/server/clinicHttp";
import { managerView } from "@/lib/server/clinics";
import ManagerLogin from "./ManagerLogin";
import ManagerDashboard from "./ManagerDashboard";

export const metadata = { title: "إدارة العيادة", robots: { index: false } };

export default async function ManagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lang = await getLang();
  const clinic = await managerClinic(slug);
  if (!clinic) {
    const exists = await clinicBySlug(slug);
    if (!exists) notFound();
    return <ManagerLogin lang={lang} slug={exists.slug} name={exists.name} look={exists.look} />;
  }
  return <ManagerDashboard lang={lang} initial={await managerView(clinic)} />;
}
