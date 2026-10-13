"use client";
import { useEffect, useState } from "react";
import { Check, Mail, Save, Send, ShieldCheck } from "lucide-react";
import type { Lang } from "@/lib/domain/types";
import { errorText, t } from "@/lib/i18n";
import { api, ApiError } from "@/lib/client";

/** قسم «التقرير اليومي» في الإعدادات — مستقلّ: حالته وواجهته البرمجية وزرّ حفظه. لا <form> (يقع داخل نموذج الإعدادات). */
export default function ReportSection({ lang, slug }: { lang: Lang; slug: string }) {
  const [loaded, setLoaded] = useState(false);
  const [daily, setDaily] = useState(true);
  const [savedDaily, setSavedDaily] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "preview" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<{ daily: boolean; email: string | null }>(`/api/staff/${slug}/report`)
      .then((r) => {
        setDaily(r.daily);
        setSavedDaily(r.daily);
        setEmail(r.email);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [slug]);

  async function run(kind: "save" | "preview") {
    setBusy(kind);
    setMsg(null);
    try {
      if (kind === "save") {
        const r = await api<{ daily: boolean }>(`/api/staff/${slug}/report`, { daily });
        setSavedDaily(r.daily);
        setMsg({ ok: true, text: t(lang, "gr_reportSaved") });
      } else {
        await api(`/api/staff/${slug}/report/preview`, {});
        setMsg({ ok: true, text: t(lang, "gr_reportPreviewSent") });
      }
    } catch (e) {
      setMsg({ ok: false, text: errorText(lang, (e as ApiError).code) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section id="report" className="card scroll-mt-28 p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <Mail size={20} />
        </span>
        <div>
          <h2 className="text-lg font-bold">{t(lang, "gr_reportTitle")}</h2>
          <p className="text-sm leading-relaxed text-slate-500">{t(lang, "gr_reportSub")}</p>
        </div>
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
        <span>
          <span className="block text-sm font-semibold text-slate-800">{t(lang, "gr_reportToggle")}</span>
          <span className="block text-xs leading-relaxed text-slate-500">{t(lang, "gr_reportToggleHint")}</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={daily}
          disabled={!loaded}
          onChange={(e) => setDaily(e.target.checked)}
        />
        <span
          aria-hidden
          className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400 ${daily ? "bg-brand-600" : "bg-slate-300"}`}
        >
          <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${daily ? "start-6" : "start-1"}`} />
        </span>
      </label>

      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        {email ? (
          <>
            {t(lang, "gr_reportEmailNote", { e: "" })}
            <span dir="ltr" className="font-semibold">{email}</span>
          </>
        ) : (
          <span className="text-amber-700">{t(lang, "gr_reportNoEmail")}</span>
        )}
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
        <ShieldCheck size={14} className="text-brand-600" /> {t(lang, "gr_reportPrivacy")}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary btn-sm" disabled={!loaded || busy !== null || daily === savedDaily} onClick={() => run("save")}>
          <Save size={16} /> {t(lang, "gr_reportSave")}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!loaded || !email || busy !== null} onClick={() => run("preview")}>
          <Send size={16} /> {t(lang, "gr_reportPreview")}
        </button>
      </div>
      {msg && (
        <p role="status" className={`mt-3 flex items-center gap-1.5 text-sm font-semibold ${msg.ok ? "text-brand-700" : "text-rose-700"}`}>
          {msg.ok && <Check size={16} />} {msg.text}
        </p>
      )}
    </section>
  );
}
