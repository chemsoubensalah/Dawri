/**
 * طباعة تذكرة أو ورقة موعد على طابعة التذاكر (حرارية 80 مم) من لوحة السكرتيرة:
 * الصفحة /staff/<slug>/print تُحمَّل في إطار مخفيّ، تحسب طولها، ثمّ تُطبع — بلا نافذة جديدة.
 * مع Chrome و«--kiosk-printing» تخرج الورقة مباشرة دون نافذة الطباعة.
 */

export const receiptUrl = (slug: string, o: { ticket: string } | { appt: string }) =>
  `/staff/${encodeURIComponent(slug)}/print?${"ticket" in o ? `t=${encodeURIComponent(o.ticket)}` : `a=${encodeURIComponent(o.appt)}`}`;

export function printReceipt(url: string) {
  const f = document.createElement("iframe");
  f.setAttribute("aria-hidden", "true");
  f.tabIndex = -1;
  // عرض الورقة الحقيقي (لا 0): التخطيط والطول كما في الطباعة
  f.style.cssText = "position:fixed;left:-10000px;top:0;width:80mm;height:200mm;border:0";
  let removed = false;
  let printed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    window.removeEventListener("message", onMsg);
    setTimeout(() => f.remove(), 1000);
  };
  const onMsg = (e: MessageEvent) => {
    if (e.source !== f.contentWindow || (e.data as { type?: string } | null)?.type !== "dawri:print-ready") return;
    printed = true;
    const w = f.contentWindow!;
    w.addEventListener("afterprint", remove);
    w.focus();
    w.print();
    setTimeout(remove, 120_000);
  };
  window.addEventListener("message", onMsg);
  f.src = url;
  document.body.appendChild(f);
  // الصفحة لم تجهز (خطأ أو شبكة): لا إطار معلّق
  setTimeout(() => !printed && remove(), 30_000);
}

/** الطباعة التلقائية بعد الإضافة/الحجز: إعداد لكلّ جهاز (الطابعة موصولة بهذا الحاسوب). */
export function autoPrint(kind: "ticket" | "appt"): boolean {
  try {
    return localStorage.getItem(`dawri:autoPrint:${kind}`) === "1";
  } catch {
    return false;
  }
}

export function setAutoPrint(kind: "ticket" | "appt", on: boolean) {
  try {
    if (on) localStorage.setItem(`dawri:autoPrint:${kind}`, "1");
    else localStorage.removeItem(`dawri:autoPrint:${kind}`);
  } catch {}
}
