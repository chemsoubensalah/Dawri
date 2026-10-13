"use client";
import { useState } from "react";

/** رسوم بيانية خفيفة بلا مكتبة (HTML فقط): أعمدة مكدّسة مع تلميح عند المرور/اللمس، وأشرطة أفقية. */

import { fmtN, SERIES } from "./format";

function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export interface Col {
  label: string;
  /** نصّ التلميح (التاريخ كاملاً مثلاً) */
  title?: string;
  values: number[];
}

export function Columns({
  data,
  series,
  height = 180,
  unit = "",
  every,
}: {
  data: Col[];
  series: { name: string; color: string }[];
  height?: number;
  unit?: string;
  /** إظهار تسمية محور كلّ كم عموداً */
  every?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0));
  const max = niceMax(Math.max(0, ...totals));
  const step = every ?? Math.max(1, Math.ceil(data.length / 8));
  const h = hover === null ? null : data[hover];
  return (
    <div dir="ltr" className="select-none">
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-3 text-xs text-slate-600" dir="rtl">
          {series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <i className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} /> {s.name}
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <div className="num flex flex-col justify-between text-end text-[10px] text-slate-400" style={{ height }}>
          <span>{fmtN(max)}</span>
          <span>{fmtN(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            {[0, 1, 2].map((i) => (
              <div key={i} className={i === 2 ? "border-t border-slate-300" : "border-t border-dashed border-slate-200"} />
            ))}
          </div>
          <div className="relative flex items-end" style={{ height }} onMouseLeave={() => setHover(null)}>
            {data.map((d, i) => (
              <div
                key={i}
                className="flex h-full flex-1 cursor-default items-end justify-center"
                onMouseEnter={() => setHover(i)}
                onClick={() => setHover(i)}
                role="img"
                aria-label={`${d.title ?? d.label}: ${series.map((s, j) => `${s.name} ${d.values[j]}`).join("، ")}`}
              >
                <div
                  className="flex w-[70%] max-w-6 flex-col-reverse gap-[2px] transition-opacity"
                  style={{ height: `${(totals[i] / max) * 100}%`, opacity: hover === null || hover === i ? 1 : 0.45 }}
                >
                  {d.values.map((v, j) =>
                    v > 0 ? (
                      <div
                        key={j}
                        className={j === d.values.length - 1 || d.values.slice(j + 1).every((x) => x === 0) ? "rounded-t" : ""}
                        style={{ flexGrow: v, minHeight: 2, background: series[j].color }}
                      />
                    ) : null,
                  )}
                </div>
              </div>
            ))}
          </div>
          {h && hover !== null && (
            <div
              className="pointer-events-none absolute -top-2 z-10 min-w-28 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
              style={{ left: `${Math.min(88, Math.max(12, ((hover + 0.5) / data.length) * 100))}%` }}
              dir="rtl"
            >
              <div className="mb-0.5 font-semibold">{h.title ?? h.label}</div>
              {series.map((s, j) => (
                <div key={s.name} className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1">
                    <i className="inline-block size-2 rounded-sm" style={{ background: s.color }} />
                    {s.name}
                  </span>
                  <b className="num">
                    {fmtN(h.values[j])}
                    {unit}
                  </b>
                </div>
              ))}
            </div>
          )}
          <div className="num mt-1 flex text-[10px] text-slate-400">
            {data.map((d, i) => (
              <span key={i} className="flex-1 text-center whitespace-nowrap">
                {i % step === 0 || i === data.length - 1 ? d.label : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** قائمة أشرطة أفقية: الاسم، الشريط، العدد والنسبة. */
export function HBars({ rows, color = SERIES[0], empty = "—" }: { rows: { label: React.ReactNode; n: number; key: string }[]; color?: string; empty?: string }) {
  const total = rows.reduce((a, r) => a + r.n, 0);
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (rows.length === 0 || total === 0) return <p className="py-6 text-center text-sm text-slate-400">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="text-sm">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="truncate text-slate-700">{r.label}</span>
            <span className="num shrink-0 text-slate-500">
              <b className="text-slate-800">{fmtN(r.n)}</b> · {Math.round((r.n / total) * 100)}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full" style={{ width: `${Math.max(2, (r.n / max) * 100)}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
