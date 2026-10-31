"use client";
import { useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Bold, Minus, Plus, RotateCcw, Trash2, Type } from "lucide-react";
import {
  CUSTOM_MAX,
  defaultLayout,
  EDITABLE,
  isCustomKey,
  LABEL_MAX,
  REQUIRED,
  TEXT_MAX,
  type BlockAlign,
  type BlockSize,
  type Layout,
  type PrintBlock,
} from "@/lib/domain/printing";
import type { Lang } from "@/lib/domain/types";
import { t, type DictKey } from "@/lib/i18n";

const SIZES: BlockSize[] = ["xs", "s", "m", "l", "xl"];
const ALIGNS: { a: BlockAlign; icon: React.ReactNode; label: DictKey }[] = [
  { a: "right", icon: <AlignRight size={16} />, label: "ps_alignRight" },
  { a: "center", icon: <AlignCenter size={16} />, label: "ps_alignCenter" },
  { a: "left", icon: <AlignLeft size={16} />, label: "ps_alignLeft" },
];
/** النصّ الأصلي للعناوين التي يغيّرها الطبيب (يظهر داخل الخانة الفارغة) */
const DEFAULT_TEXT: Record<Layout, Record<string, DictKey>> = {
  ticket: { label: "pr_yourNumber", qr: "pr_scanTicket", note: "pr_keepTicket" },
  appt: { label: "pr_yourAppt", qr: "pr_scanAppt", note: "pr_comeEarly" },
};

const base = (key: string) => key.replace(/-\d+$/, "");

function elName(lang: Lang, kind: Layout, key: string): string {
  const n = base(key);
  return t(lang, (n === "label" || n === "note" || n === "date" ? `ps_el_${n}_${kind}` : `ps_el_${n}`) as DictKey);
}

/**
 * تصميم ورقة واحدة: كلّ سطر عنصر يُظهر/يُخفى ويُرتَّب، وبالضغط عليه: الحجم، الغامق، المحاذاة، ونصّ الطبيب.
 * يضيف الطبيب أسطر نصّ وخطوطاً فاصلة. الرقم (أو ساعة الموعد) لا يُخفى.
 */
export default function TicketDesigner({ lang, kind, blocks, onChange }: { lang: Lang; kind: Layout; blocks: PrintBlock[]; onChange: (b: PrintBlock[]) => void }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const customs = blocks.filter((b) => isCustomKey(b.key)).length;

  const update = (key: string, patch: Partial<PrintBlock>) => onChange(blocks.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...blocks];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  const add = (prefix: "text" | "line") => {
    const n = Math.max(0, ...blocks.filter((b) => b.key.startsWith(`${prefix}-`)).map((b) => Number(b.key.split("-")[1]) || 0)) + 1;
    const nb: PrintBlock = { key: `${prefix}-${n}`, show: true, size: "m", bold: false, align: "center", text: prefix === "text" ? "" : null };
    // قبل «دوري · Dawri» إن وُجد، وإلّا في الآخر
    const at = blocks.findIndex((b) => b.key === "footer");
    const next = [...blocks];
    next.splice(at === -1 ? next.length : at, 0, nb);
    onChange(next);
    if (prefix === "text") setOpenKey(nb.key);
  };

  const iconBtn = "inline-flex size-8 items-center justify-center rounded-lg text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-30";

  return (
    <div data-testid={`designer-${kind}`}>
      <ul className="space-y-1.5">
        {blocks.map((b, i) => {
          const line = b.key.startsWith("line-");
          const custom = isCustomKey(b.key);
          const required = b.key === REQUIRED[kind];
          const open = openKey === b.key && !line;
          const editable = EDITABLE.has(b.key) || (custom && !line);
          return (
            <li key={b.key} className={`rounded-xl bg-white ring-1 transition ${open ? "ring-brand-300" : "ring-slate-200"}`} data-testid={`block-${b.key}`}>
              <div className={`flex items-center gap-2 p-2 ${b.show ? "" : "opacity-55"}`}>
                {line ? (
                  <Minus size={18} className="mx-0.5 shrink-0 text-slate-400" />
                ) : (
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 accent-brand-600"
                    checked={b.show}
                    disabled={required}
                    onChange={(e) => update(b.key, { show: e.target.checked })}
                    aria-label={elName(lang, kind, b.key)}
                    title={required ? t(lang, "ps_required") : undefined}
                  />
                )}
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-start text-sm font-semibold text-ink disabled:cursor-default"
                  disabled={line}
                  onClick={() => setOpenKey(open ? null : b.key)}
                  aria-expanded={open}
                >
                  {custom && !line ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Type size={14} className="shrink-0 text-brand-600" /> {b.text || <span className="font-normal text-slate-400">{t(lang, "ps_el_text")}</span>}
                    </span>
                  ) : (
                    elName(lang, kind, b.key)
                  )}
                  {b.text && EDITABLE.has(b.key) && <span className="ms-1.5 font-normal text-slate-500">· {b.text}</span>}
                </button>
                <button type="button" className={iconBtn} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${t(lang, "ps_up")} — ${elName(lang, kind, b.key)}`}>
                  <ArrowUp size={15} />
                </button>
                <button type="button" className={iconBtn} disabled={i === blocks.length - 1} onClick={() => move(i, 1)} aria-label={`${t(lang, "ps_down")} — ${elName(lang, kind, b.key)}`}>
                  <ArrowDown size={15} />
                </button>
                {custom && (
                  <button
                    type="button"
                    className={`${iconBtn} text-rose-500 ring-rose-200 hover:bg-rose-50`}
                    onClick={() => onChange(blocks.filter((x) => x.key !== b.key))}
                    aria-label={`${t(lang, "ps_remove")} — ${elName(lang, kind, b.key)}`}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>

              {open && (
                <div className="space-y-2.5 border-t border-slate-100 p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">{t(lang, "ps_textSize")}</span>
                    <div className="inline-flex items-end rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label={t(lang, "ps_textSize")}>
                      {SIZES.map((sz, j) => (
                        <button
                          type="button"
                          key={sz}
                          role="radio"
                          aria-checked={b.size === sz}
                          aria-label={`${t(lang, "ps_textSize")} ${j + 1}/5`}
                          onClick={() => update(b.key, { size: sz })}
                          className={`flex h-8 min-w-8 items-end justify-center rounded-lg px-1.5 pb-1 leading-none font-bold transition ${b.size === sz ? "bg-white text-brand-800 shadow-sm" : "text-slate-500"}`}
                          style={{ fontSize: `${0.7 + j * 0.16}rem` }}
                        >
                          A
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      aria-pressed={b.bold}
                      onClick={() => update(b.key, { bold: !b.bold })}
                      className={`inline-flex h-10 items-center gap-1 rounded-xl px-3 text-sm font-bold ring-1 transition ${b.bold ? "bg-brand-50 text-brand-800 ring-brand-300" : "text-slate-500 ring-slate-200"}`}
                    >
                      <Bold size={15} /> {t(lang, "ps_bold")}
                    </button>
                    <div className="inline-flex rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label={t(lang, "ps_alignCenter")}>
                      {/* يمين ثمّ وسط ثمّ يسار كما على الورق، مهما كان اتّجاه الواجهة */}
                      <div dir="ltr" className="flex">
                        {[...ALIGNS].reverse().map((x) => (
                          <button
                            type="button"
                            key={x.a}
                            role="radio"
                            aria-checked={b.align === x.a}
                            aria-label={t(lang, x.label)}
                            title={t(lang, x.label)}
                            onClick={() => update(b.key, { align: x.a })}
                            className={`inline-flex size-8 items-center justify-center rounded-lg transition ${b.align === x.a ? "bg-white text-brand-800 shadow-sm" : "text-slate-500"}`}
                          >
                            {x.icon}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {editable && (
                    <input
                      className="input text-sm"
                      value={b.text ?? ""}
                      maxLength={custom ? TEXT_MAX : LABEL_MAX}
                      placeholder={custom ? t(lang, "ps_customPh") : t(lang, DEFAULT_TEXT[kind][b.key])}
                      aria-label={custom ? t(lang, "ps_el_text") : t(lang, "ps_ownText")}
                      onChange={(e) => update(b.key, { text: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                      data-testid={`block-text-${b.key}`}
                      autoFocus={custom && !b.text}
                    />
                  )}
                  {editable && !custom && <p className="text-xs text-slate-500">{t(lang, "ps_ownText")}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-secondary btn-sm" disabled={customs >= CUSTOM_MAX} onClick={() => add("text")} data-testid={`add-text-${kind}`}>
          <Plus size={15} /> {t(lang, "ps_addText")}
        </button>
        <button type="button" className="btn-secondary btn-sm" disabled={customs >= CUSTOM_MAX} onClick={() => add("line")}>
          <Minus size={15} /> {t(lang, "ps_addLine")}
        </button>
        <button type="button" className="btn-ghost btn-sm text-slate-600" onClick={() => onChange(defaultLayout(kind))} data-testid={`reset-${kind}`}>
          <RotateCcw size={15} /> {t(lang, "ps_reset")}
        </button>
      </div>
    </div>
  );
}
