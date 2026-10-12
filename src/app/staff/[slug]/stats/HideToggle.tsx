"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import type { Lang } from "@/lib/domain/types";
import { errorText, t } from "@/lib/i18n";
import { api, ApiError } from "@/lib/client";

export default function HideToggle({ lang, slug, id, hidden }: { lang: Lang; slug: string; id: string; hidden: boolean }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toggle = async () => {
    setBusy(true);
    try {
      await api(`/api/staff/${slug}/reviews/hide`, { id, hidden: !hidden });
      router.refresh();
    } catch (e) {
      alert(errorText(lang, (e as ApiError).code));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="btn-ghost btn-sm shrink-0 text-slate-500" onClick={toggle} disabled={busy} data-testid={`review-hide-${id}`}>
      {hidden ? <Eye size={15} /> : <EyeOff size={15} />} {hidden ? t(lang, "rv_unhide") : t(lang, "rv_hide")}
    </button>
  );
}
