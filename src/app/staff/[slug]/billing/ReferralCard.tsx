import { Gift, MessageCircle } from "lucide-react";
import type { Lang } from "@/lib/domain/types";
import { t } from "@/lib/i18n";
import { now as clockNow } from "@/lib/server/clock";
import { getDb } from "@/lib/server/db";
import { baseUrl } from "@/lib/server/http";
import { referralStats } from "@/lib/server/referral";
import CopyField from "./CopyField";

/** «ادعُ زميلاً: شهر مجّاني لكما» — صفحة الاشتراك. */
export default async function ReferralCard({ lang, shopId }: { lang: Lang; shopId: string }) {
  const db = await getDb();
  const s = await referralStats(db, shopId, clockNow());
  const link = `${await baseUrl()}/new?ref=${s.code}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(`${t(lang, "gr_refWaText")}\n${link}`)}`;
  const stats: [string, number][] = [
    [t(lang, "gr_refJoined"), s.invited],
    [t(lang, "gr_refPaid"), s.paid],
    [t(lang, "gr_refMonths"), s.rewardedMonths],
  ];
  return (
    <section className="card overflow-hidden p-0">
      <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Gift size={22} /> {t(lang, "gr_refTitle")}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-brand-50/90">{t(lang, "gr_refSub")}</p>
      </div>
      <div className="space-y-4 p-6">
        <CopyField label={t(lang, "gr_refLink")} value={link} copy={t(lang, "gr_refCopy")} copied={t(lang, "gr_refCopied")} />
        <div className="flex flex-wrap items-center gap-3">
          <a href={wa} target="_blank" rel="noopener noreferrer" className="btn bg-[#128C7E] text-white hover:bg-[#0e6f64]">
            <MessageCircle size={18} /> {t(lang, "gr_refWhatsapp")}
          </a>
          <span className="text-sm text-slate-500">
            {t(lang, "gr_refCode")}: <span dir="ltr" className="num font-bold tracking-widest text-ink">{s.code}</span>
          </span>
        </div>
        <dl className="grid grid-cols-3 gap-3">
          {stats.map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-slate-50 p-3 text-center">
              <dd className="num text-2xl font-bold text-brand-700" dir="ltr">{v}</dd>
              <dt className="text-xs text-slate-500">{k}</dt>
            </div>
          ))}
        </dl>
        <p className="text-xs leading-relaxed text-slate-500">{s.capped ? t(lang, "gr_refCapped") : t(lang, "gr_refRules")}</p>
      </div>
    </section>
  );
}
