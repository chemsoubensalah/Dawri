"use client";
import { useEffect, useState } from "react";
import { Trash2, UserRoundCog } from "lucide-react";
import type { Lang } from "@/lib/domain/types";
import { errorText, t } from "@/lib/i18n";
import { api, ApiError } from "@/lib/client";

/**
 * رمز السكرتيرة (داخل قسم «الأمان»): تدير الطابور فقط، دون الإعدادات أو الاشتراك.
 * مستقلّ عن نموذج الإعدادات (حالته وزرّه وواجهته الخاصّة) — لا يُرسل النموذج الأب.
 */
export default function AssistantPin({ lang, slug }: { lang: Lang; slug: string }) {
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<{ hasPin: boolean }>(`/api/staff/${slug}/assistant`)
      .then((r) => setHasPin(r.hasPin))
      .catch(() => setHasPin(false));
  }, [slug]);

  async function send(value: string | null) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ hasPin: boolean }>(`/api/staff/${slug}/assistant`, { pin: value });
      setHasPin(r.hasPin);
      setPin("");
      setMsg({ ok: true, text: t(lang, r.hasPin ? "cl_asstSaved" : "cl_asstRemoved") });
    } catch (e) {
      setMsg({ ok: false, text: errorText(lang, (e as ApiError).code) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70" data-testid="assistant-pin">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <UserRoundCog size={20} />
        </span>
        <div className="min-w-0 flex-1 leading-relaxed">
          <p className="font-bold text-ink">
            {t(lang, "cl_asstTitle")}
            {hasPin !== null && (
              <span className={`ms-2 rounded-full px-2 py-0.5 text-xs font-semibold ${hasPin ? "bg-brand-100 text-brand-800" : "bg-slate-200 text-slate-600"}`}>
                {t(lang, hasPin ? "cl_asstOn" : "cl_asstOff")}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-sm text-slate-600">{t(lang, "cl_asstHint")}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <label className="label" htmlFor="asst-pin">{t(lang, hasPin ? "cl_asstNew" : "cl_asstPin")}</label>
          <input
            id="asst-pin"
            className="input num tracking-[0.3em]"
            dir="ltr"
            inputMode="numeric"
            type="password"
            autoComplete="new-password"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              // Enter هنا لا يرسل نموذج الإعدادات
              if (e.key === "Enter") {
                e.preventDefault();
                if (pin.length >= 4) send(pin);
              }
            }}
          />
        </div>
        <button type="button" className="btn-primary" disabled={busy || pin.length < 4} onClick={() => send(pin)}>
          {t(lang, hasPin ? "cl_asstChange" : "cl_asstSet")}
        </button>
        {hasPin && (
          <button
            type="button"
            className="btn-ghost text-rose-700"
            disabled={busy}
            onClick={() => {
              if (confirm(t(lang, "cl_asstRemoveConfirm"))) send(null);
            }}
          >
            <Trash2 size={16} /> {t(lang, "cl_asstRemove")}
          </button>
        )}
      </div>
      {msg && <p className={`mt-2 text-sm font-semibold ${msg.ok ? "text-brand-700" : "text-rose-700"}`} role="status">{msg.text}</p>}
    </div>
  );
}
