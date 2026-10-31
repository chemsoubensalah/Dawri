"use client";
import { useEffect } from "react";
import { Printer } from "lucide-react";

/**
 * الورقة جاهزة: ننتظر الخطّ، نقيس طولها ونضبط الصفحة عليه (80 مم × الطول) فلا تخرج ورقة بيضاء طويلة،
 * ثمّ نُعلم اللوحة (إطار مخفيّ) لتطبع — أو نطبع مباشرة إن فُتحت الصفحة وحدها.
 */
export default function PrintReady({ label, paper, button = true }: { label: string; paper: number; button?: boolean }) {
  useEffect(() => {
    let alive = true;
    (async () => {
      await document.fonts?.ready;
      const el = document.getElementById("receipt");
      if (!alive || !el) return;
      // + مسافة قبل القصّ الآلي
      const mm = Math.ceil((el.getBoundingClientRect().height * 25.4) / 96) + 10;
      const style = document.createElement("style");
      style.textContent = `@page { size: ${paper}mm ${mm}mm; margin: 0 } @media print { html, body { min-height: 0 !important; background: #fff !important } }`;
      document.head.appendChild(style);
      if (window.parent !== window) window.parent.postMessage({ type: "dawri:print-ready" }, location.origin);
      else window.print();
    })();
    return () => {
      alive = false;
    };
  }, [paper]);
  if (!button) return null;
  return (
    <button type="button" className="no-print btn-primary mx-auto mt-6 flex" onClick={() => window.print()}>
      <Printer size={18} /> {label}
    </button>
  );
}
