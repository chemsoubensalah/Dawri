import { Clock3, MapPin, Phone, Stethoscope } from "lucide-react";
import type { Lang, ShopKind, ShopProfile } from "@/lib/domain/types";
import { errorText, t, type DictKey } from "@/lib/i18n";
import { Chip, LiveDot } from "./ui";

/** بطاقة العيادة كما يراها المريض. */
export default function ClinicCard({
  lang,
  name,
  kind,
  profile,
  blocker,
  hoursToday,
  compact = false,
}: {
  lang: Lang;
  name: string;
  kind: ShopKind;
  profile: ShopProfile;
  blocker?: string | null;
  hoursToday?: [string, string][];
  compact?: boolean;
}) {
  const sub = [profile.doctorName, profile.specialty || t(lang, `kind_${kind}` as DictKey)].filter(Boolean).join(" · ");
  return (
    <section className="card overflow-hidden p-0">
      <div className="flex items-start gap-4 p-5">
        <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-(--shadow-brand)">
          <Stethoscope size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl leading-snug font-bold text-ink">{name}</h1>
          <p className="truncate text-sm text-slate-500">{sub}</p>
          {blocker !== undefined && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {blocker ? (
                <Chip tone="amber">{errorText(lang, blocker)}</Chip>
              ) : (
                <Chip tone="green">
                  <LiveDot /> {t(lang, "sp_open")}
                </Chip>
              )}
              {hoursToday && (
                <Chip>
                  <Clock3 size={12} />
                  <span dir="ltr" className="num">
                    {hoursToday.length ? hoursToday.map(([a, b]) => `${a}–${b}`).join(" · ") : t(lang, "closedToday")}
                  </span>
                </Chip>
              )}
            </div>
          )}
        </div>
      </div>
      {!compact && (profile.address || profile.phone) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3">
          {profile.address && (
            profile.mapsUrl ? (
              <a href={profile.mapsUrl} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-slate-600 hover:text-brand-700">
                <MapPin size={16} className="shrink-0 text-brand-600" />
                <span className="truncate underline-offset-2 hover:underline">{profile.address}</span>
              </a>
            ) : (
              <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-slate-600">
                <MapPin size={16} className="shrink-0 text-brand-600" />
                <span className="truncate">{profile.address}</span>
              </span>
            )
          )}
          {profile.phone && (
            <a href={`tel:${profile.phone.replace(/\s/g, "")}`} className="btn-secondary btn-sm">
              <Phone size={15} /> <span dir="ltr">{profile.phone}</span>
            </a>
          )}
        </div>
      )}
    </section>
  );
}
