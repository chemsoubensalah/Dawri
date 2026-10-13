"use client";
import { useEffect, useState } from "react";
import { Lightbulb, MonitorPlay, Plus, Save, Trash2 } from "lucide-react";
import type { Lang } from "@/lib/domain/types";
import { errorText, t, type DictKey } from "@/lib/i18n";
import { api, ApiError } from "@/lib/client";

const MAX = 10;
const LEN = 160;
const SUGGEST: DictKey[] = ["tv_s1", "tv_s2", "tv_s3", "tv_s4", "tv_s5", "tv_s6", "tv_s7"];

/** رسائل ونصائح شاشة القاعة — قسم مستقلّ بحفظه الخاصّ. */
export default function TvMessagesSection({ lang, slug }: { lang: Lang; slug: string }) {
  const [items, setItems] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<{ items: string[] }>(`/api/staff/${slug}/tv-messages`)
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, [slug]);

  const list = items ?? [];
  const set = (next: string[]) => {
    setItems(next);
    setMsg(null);
  };

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ items: string[] }>(`/api/staff/${slug}/tv-messages`, { items: list });
      setItems(r.items);
      setMsg({ ok: true, text: t(lang, "tv_saved") });
    } catch (e) {
      setMsg({ ok: false, text: errorText(lang, (e as ApiError).code) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="tv" className="card scroll-mt-28 p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <MonitorPlay size={20} />
        </span>
        <div className="flex-1">
          <h2 className="text-lg font-bold">{t(lang, "tv_se")}</h2>
          <p className="text-sm text-slate-500">{t(lang, "tv_seSub")}</p>
        </div>
        <span className="num shrink-0 text-xs font-semibold text-slate-400" dir="ltr">
          {t(lang, "tv_count", { n: list.length, max: MAX })}
        </span>
      </div>

      {items !== null && list.length === 0 && <p className="mb-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">{t(lang, "tv_empty")}</p>}
      <ul className="space-y-2.5">
        {list.map((m, i) => (
          <li key={i} className="flex items-start gap-2">
            <Lightbulb size={18} className="mt-3 shrink-0 text-amber-500" />
            <div className="flex-1">
              <textarea
                className="input min-h-12 resize-y py-2.5 leading-relaxed"
                rows={1}
                maxLength={LEN}
                value={m}
                placeholder={t(lang, "tv_ph")}
                onChange={(e) => set(list.map((x, j) => (j === i ? e.target.value : x)))}
              />
              <div className="num mt-0.5 text-end text-[11px] text-slate-400" dir="ltr">{m.length}/{LEN}</div>
            </div>
            <button type="button" className="mt-1.5 rounded-lg p-2 text-rose-500 hover:bg-rose-50" aria-label="×" onClick={() => set(list.filter((_, j) => j !== i))}>
              <Trash2 size={17} />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary btn-sm" disabled={list.length >= MAX} onClick={() => set([...list, ""])}>
          <Plus size={15} /> {t(lang, "tv_add")}
        </button>
        <button type="button" className="btn-primary btn-sm ms-auto" disabled={busy || items === null} onClick={save} data-testid="tv-save">
          <Save size={15} /> {t(lang, "tv_save")}
        </button>
      </div>
      {msg && <p className={`mt-2 text-sm font-semibold ${msg.ok ? "text-brand-700" : "text-rose-700"}`} role="status">{msg.text}</p>}

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="mb-2 text-xs font-semibold text-slate-500">{t(lang, "tv_suggest")}</div>
        <div className="flex flex-wrap gap-2">
          {SUGGEST.map((k) => {
            const text = t(lang, k);
            const used = list.includes(text);
            return (
              <button
                type="button"
                key={k}
                disabled={used || list.length >= MAX}
                onClick={() => set([...list, text])}
                className="rounded-full bg-slate-50 px-3 py-1.5 text-start text-xs text-slate-700 ring-1 ring-slate-200 transition hover:bg-brand-50 hover:ring-brand-200 disabled:opacity-40"
              >
                + {text}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
