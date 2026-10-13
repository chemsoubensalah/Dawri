"use client";
import { useState } from "react";
import { CreditCard } from "lucide-react";
import { api } from "@/lib/client";

/**
 * يُنشئ صفحة دفع جديدة عند الضغط ثمّ ينتقل إليها (البطاقة الذهبية / CIB عبر Chargily).
 * endpoint: /api/staff/{slug}/billing (طبيب واحد) أو /api/c/{slug}/billing (عيادة متعدّدة الأطبّاء).
 */
export default function PayButton({ endpoint, months, label, errorLabel }: { endpoint: string; months: number; label: string; errorLabel: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn-primary mt-5 w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(false);
          try {
            const r = await api<{ url: string }>(endpoint, { months });
            location.href = r.url;
          } catch {
            setError(true);
            setBusy(false);
          }
        }}
      >
        <CreditCard size={18} /> {busy ? "…" : label}
      </button>
      {error && <p className="mt-2 text-center text-sm text-rose-700">{errorLabel}</p>}
    </>
  );
}
