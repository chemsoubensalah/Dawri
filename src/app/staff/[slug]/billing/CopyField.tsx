"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export default function CopyField({ label, value, copy, copied }: { label: string; value: string; copy: string; copied: string }) {
  const [done, setDone] = useState(false);
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // متصفّحات قديمة: نحدّد النصّ ليُنسخ يدوياً
      const el = document.getElementById("ref-link") as HTMLInputElement | null;
      el?.select();
      return;
    }
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  }
  return (
    <div>
      <label className="label" htmlFor="ref-link">{label}</label>
      <div className="flex gap-2">
        <input id="ref-link" readOnly dir="ltr" className="input min-w-0 flex-1 text-start" value={value} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn btn-secondary shrink-0" onClick={onCopy}>
          {done ? <Check size={18} /> : <Copy size={18} />} {done ? copied : copy}
        </button>
      </div>
    </div>
  );
}
