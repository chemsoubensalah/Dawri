"use client";
import { useEffect, useRef, useState } from "react";

export interface Bar {
  key: string;
  label: string; // نصّ المحور (قد يكون فارغاً لتخفيف المحور)
  tip: string; // نصّ التلميح عند المرور
  value: number;
}

/**
 * مخطّط أعمدة لسلسلة واحدة: أعمدة رفيعة بنهاية مدوّرة 4px، فجوة 2px، خطوط شبكة خافتة،
 * وتلميح عند المرور/اللمس. لون واحد (لا حاجة لمفتاح — العنوان يسمّي السلسلة).
 */
export default function BarChart({ data, height = 180, color = "var(--color-brand-600)", unit = "" }: { data: Bar[]; height?: number; color?: string; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  // عرض حقيقي بالبكسل: النصوص تبقى بحجمها (11px) على الهاتف بدل أن تُصغَّر مع الرسم
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const max = Math.max(1, ...data.map((d) => d.value));
  const nice = (() => {
    const pow = 10 ** Math.floor(Math.log10(max));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => max / s <= 4) ?? pow * 10;
    return Math.ceil(max / step) * step;
  })();
  // لا «0.5 مريض»: المنتصف فقط إن كان عدداً صحيحاً
  const ticks = Number.isInteger(nice / 2) ? [0, nice / 2, nice] : [0, nice];
  const H = height;
  const padL = 30;
  const padB = 22;
  const plotW = W - padL - 4;
  const plotH = H - padB - 8;
  const band = plotW / data.length;
  const bw = Math.min(24, Math.max(3, band - 2));
  const y = (v: number) => 8 + plotH - (v / nice) * plotH;
  // تسميات المحور: نتخطّى ما يلتصق بالسابقة (≥ 34px بينها)
  let lastX = -Infinity;
  const showLabel = data.map((d, i) => {
    const cx = padL + i * band + band / 2;
    if (!d.label || cx - lastX < 34) return false;
    lastX = cx;
    return true;
  });

  return (
    <div className="relative" dir="ltr" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-hidden="true">
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={padL} x2={W - 4} y1={y(tk)} y2={y(tk)} stroke="#e8edf3" strokeWidth="1" />
            <text x={padL - 6} y={y(tk) + 4} textAnchor="end" fontSize="11" fill="#64748b" className="num">
              {Number.isInteger(tk) ? tk : tk.toFixed(1)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + i * band + (band - bw) / 2;
          const top = y(d.value);
          const h = 8 + plotH - top;
          const r = Math.min(4, h);
          return (
            <g key={d.key}>
              {/* هدف لمس أكبر من العمود */}
              <rect
                x={padL + i * band}
                y={8}
                width={band}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onTouchStart={() => setHover(i)}
              />
              {d.value > 0 && (
                <path
                  d={`M${x},${8 + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${8 + plotH} Z`}
                  fill={color}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                  pointerEvents="none"
                />
              )}
              {showLabel[i] && (
                <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize="10.5" fill="#64748b" className="num">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
        <line x1={padL} x2={W - 4} y1={8 + plotH} y2={8 + plotH} stroke="#cbd5e1" strokeWidth="1" />
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl bg-ink px-3 py-2 text-xs whitespace-nowrap text-white shadow-lg"
          style={{ left: `${Math.min(85, Math.max(15, ((padL + hover * band + band / 2) / W) * 100))}%` }}
        >
          <div className="text-slate-300" dir="auto">{data[hover].tip}</div>
          <div className="num text-sm font-bold">
            {data[hover].value}
            {unit}
          </div>
        </div>
      )}
    </div>
  );
}
