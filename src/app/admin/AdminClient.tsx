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

/**
 * تفعيل يدوي: طابور طبيب واحد (shopId) أو عيادة متعدّدة الأطبّاء (clinicId).
 * نوعان واضحان: «دفع فعلاً» (المبلغ يُحسب في المداخيل) أو «هدية مجانية» (0 دج — لا يُحسب).
 */
export function ExtendForm({ shopId, clinicId, price, yearPrice }: { shopId?: string; clinicId?: string; price: number; yearPrice: number }) {
  const [months, setMonths] = useState(1);
  const [kind, setKind] = useState<"paid" | "gift">("paid");
  const [amount, setAmount] = useState(price);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const sum = kind === "gift" ? 0 : Math.max(0, Math.round(amount || 0));
  return (
    <form
      className="flex flex-wrap items-center gap-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        const q =
          kind === "gift"
            ? `هدية مجانية: +${months} شهر بـ 0 دج (لا تُحسب في المداخيل). متابعة؟`
            : `دفعة حقيقية: ${sum.toLocaleString("fr-DZ")} دج مقابل +${months} شهر (تُحسب في المداخيل). متابعة؟`;
        if (!confirm(q)) return;
        try {
          const n = kind === "gift" ? note.trim() || "هدية" : note;
          await api("/api/admin/extend", clinicId ? { clinicId, months, amount: sum, note: n } : { shopId, months, amount: sum, note: n });
          location.reload();
        } catch {
          setMsg("✗");
        }
      }}
    >
      <select className="rounded-lg border border-slate-200 px-2 py-1" value={months} onChange={(e) => { const m = Number(e.target.value); setMonths(m); setAmount(m === 12 ? yearPrice : price * m); }}>
        {[1, 3, 6, 12].map((m) => (
          <option key={m} value={m}>+{m} شهر</option>
        ))}
      </select>
      <select className="rounded-lg border border-slate-200 px-2 py-1" value={kind} onChange={(e) => setKind(e.target.value as "paid" | "gift")} aria-label="نوع التفعيل" data-testid="extend-kind">
        <option value="paid">دفع فعلاً</option>
        <option value="gift">هدية مجانية</option>
      </select>
      {kind === "paid" ? (
        <input className="num w-24 rounded-lg border border-slate-200 px-2 py-1" type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} aria-label="المبلغ (دج)" />
      ) : (
        <span className="num w-24 rounded-lg bg-violet-50 px-2 py-1 text-center text-violet-700">0 دج</span>
      )}
      <input className="w-28 rounded-lg border border-slate-200 px-2 py-1" placeholder="ملاحظة" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn-primary btn-sm">تفعيل</button>
      {msg && <span className="text-rose-700">{msg}</span>}
    </form>
  );
}

/** سجلّ الدفعات: تصحيح دفعة سُجّلت بمبلغ خطأ (مثلاً هدية سُجّلت بسعر السنة) ← 0 دج. */
export function MakeFreeButton({ id, amount }: { id: number; amount: number }) {
  const [busy, setBusy] = useState(false);
  if (amount === 0) return <span className="text-xs text-violet-700">هدية</span>;
  return (
    <button
      type="button"
      className="text-xs text-slate-500 underline hover:text-violet-700 disabled:opacity-50"
      disabled={busy}
      data-testid="make-free"
      onClick={async () => {
        if (!confirm(`جعل هذه الدفعة مجانية (0 دج بدل ${amount.toLocaleString("fr-DZ")} دج)؟ تُحذف من المداخيل، ومدّة الاشتراك لا تتغيّر.`)) return;
        setBusy(true);
        try {
          await api("/api/admin/payment", { id, amount: 0, note: "هدية (صُحّحت)" });
          location.reload();
        } catch {
          alert("✗");
          setBusy(false);
        }
      }}
    >
      اجعلها مجانية
    </button>
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

/** اختبار البريد: يرسل رسالة تجريبية ويعرض سبب الفشل كما يردّه Brevo. */
export function TestEmail() {
  const [to, setTo] = useState("");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card space-y-2 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setOut("");
        try {
          const r = await api<{ ok: boolean; error?: string; config: Record<string, unknown> }>("/api/admin/test-email", { to });
          setOut(r.ok ? `✓ أُرسلت — افحص البريد (وSpam).\n${JSON.stringify(r.config)}` : `✗ ${r.error}\n${JSON.stringify(r.config)}`);
        } catch {
          setOut("✗");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-bold">اختبار البريد · Test e-mail</h2>
      <div className="flex flex-wrap gap-2">
        <input className="input max-w-xs flex-1" dir="ltr" type="email" required value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@gmail.com" />
        <button className="btn-primary btn-sm" disabled={busy}>{busy ? "…" : "إرسال"}</button>
      </div>
      {out && <pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs whitespace-pre-wrap" dir="ltr" data-testid="test-email-out">{out}</pre>}
    </form>
  );
}
