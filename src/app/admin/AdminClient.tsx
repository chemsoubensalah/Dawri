"use client";
import { useState } from "react";
import { api } from "@/lib/client";

export default function AdminLogin() {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState(false);
  return (
    <main className="bg-mesh flex min-h-dvh items-center justify-center p-4">
      <form
        className="card w-full max-w-sm space-y-3 p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("/api/admin/login", { secret });
            location.reload();
          } catch {
            setError(true);
          }
        }}
      >
        <h1 className="text-lg font-bold">Admin</h1>
        <input className="input" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="ADMIN_SECRET" autoFocus />
        {error && <p className="text-sm text-rose-700">✗</p>}
        <button className="btn-primary w-full">دخول</button>
      </form>
    </main>
  );
}

export function ExtendForm({ shopId, price }: { shopId: string; price: number }) {
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState(price);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <form
      className="flex flex-wrap items-center gap-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!confirm(`+${months} ?`)) return;
        try {
          await api("/api/admin/extend", { shopId, months, amount, note });
          location.reload();
        } catch {
          setMsg("✗");
        }
      }}
    >
      <select className="rounded-lg border border-slate-200 px-2 py-1" value={months} onChange={(e) => { const m = Number(e.target.value); setMonths(m); setAmount(m === 12 ? price * 10 : price * m); }}>
        {[1, 3, 6, 12].map((m) => (
          <option key={m} value={m}>+{m} شهر</option>
        ))}
      </select>
      <input className="num w-24 rounded-lg border border-slate-200 px-2 py-1" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
      <input className="w-28 rounded-lg border border-slate-200 px-2 py-1" placeholder="ملاحظة" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn-primary btn-sm">تفعيل</button>
      {msg && <span className="text-rose-700">{msg}</span>}
    </form>
  );
}

/** رمز مؤقّت جديد لعيادة نسيت رمزها (يُعرض مرّة واحدة: أرسله للطبيب). */
export function ResetPinButton({ shopId }: { shopId: string }) {
  const [pin, setPin] = useState("");
  return pin ? (
    <div className="mt-1 text-xs font-semibold text-brand-800">
      الرمز الجديد: <b className="num select-all text-base" dir="ltr">{pin}</b>
    </div>
  ) : (
    <button
      type="button"
      className="mt-1 text-xs text-slate-500 underline hover:text-rose-700"
      onClick={async () => {
        if (!confirm("إنشاء رمز سرّي جديد لهذه العيادة؟ سيُخرَج كلّ من هو مسجّل الدخول.")) return;
        try {
          setPin((await api<{ pin: string }>("/api/admin/reset-pin", { shopId })).pin);
        } catch {
          alert("✗");
        }
      }}
    >
      رمز سرّي جديد
    </button>
  );
}
