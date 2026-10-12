import { notFound } from "next/navigation";
import { getDb } from "@/lib/server/db";
import { getLang } from "@/lib/server/http";
import * as repo from "@/lib/server/repo";
import ResetForm from "./ResetForm";

export const metadata = { title: "رمز سرّي جديد", robots: { index: false } };

/** يُفتح من رابط البريد: اختيار رمز سرّي جديد. */
export default async function ResetPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const token = (await searchParams).t ?? "";
  const shop = await repo.getShopBySlug(await getDb(), slug.toLowerCase());
  if (!shop) notFound();
  return <ResetForm lang={await getLang(shop.defaultLang)} slug={shop.slug} name={shop.name} look={shop.look} token={token} />;
}
