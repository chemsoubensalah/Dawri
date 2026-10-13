import LegalPage from "@/components/LegalPage";
import { getLang } from "@/lib/server/http";
import { termsContent } from "@/lib/legal";
import { MAX_DOCTORS, clinicPriceDzd, clinicYearPriceDzd, priceDzd, yearPriceDzd } from "@/lib/pricing";

export const metadata = { title: "شروط الاستعمال — Dawri" };

export default async function Terms() {
  const lang = await getLang();
  return <LegalPage lang={lang} {...termsContent(lang, { price: priceDzd(), yearPrice: yearPriceDzd(), clinicPrice: clinicPriceDzd(), clinicYearPrice: clinicYearPriceDzd(), maxDoctors: MAX_DOCTORS })} />;
}
