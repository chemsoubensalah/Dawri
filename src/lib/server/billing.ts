/**
 * اشتراك العيادة: Chargily Pay V2 (البطاقة الذهبية و CIB) + تحويل يدوي (بريدي موب / CCP).
 * Chargily لا يدعم الاقتطاع الشهري التلقائي، لذا كلّ دفعة = صفحة دفع لمرّة واحدة (شهر أو سنة).
 * لا نثق بصفحة النجاح: التفعيل فقط عند حدث checkout.paid الموقَّع.
 *
 * المتغيّرات: CHARGILY_SECRET_KEY (test_sk_… أو مفتاح live)، CHARGILY_API_BASE (اختياري).
 */
import crypto from "node:crypto";
import { DomainError, type Lang, type Shop } from "../domain/types";
import { priceNumber } from "../pricing";
import { now as clockNow } from "./clock";
import { getDb } from "./db";
import * as repo from "./repo";

export function chargilyConfig() {
  const secret = process.env.CHARGILY_SECRET_KEY ?? "";
  const base =
    process.env.CHARGILY_API_BASE ??
    (secret.startsWith("test_") ? "https://pay.chargily.net/test/api/v2" : "https://pay.chargily.net/api/v2");
  return { secret, base: base.replace(/\/$/, ""), enabled: Boolean(secret), test: secret.startsWith("test_") };
}

/** الخطط: شهري، أو سنوي بسعر 10 أشهر (شهران مجّاناً). */
export function plans() {
  const month = priceNumber();
  return [
    { months: 1, amount: month },
    { months: 12, amount: month * 10 },
  ];
}

export function manualPayment() {
  return {
    holder: process.env.BILLING_HOLDER ?? null,
    ccp: process.env.BILLING_CCP ?? null,
    rip: process.env.BILLING_RIP ?? null,
    whatsapp: (process.env.SUPPORT_WHATSAPP ?? "").replace(/\D/g, "") || null,
  };
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
type G = { __dawriChargilyFetch?: Fetcher };
const g = globalThis as G;
/** للاختبارات. */
export function setChargilyFetch(f: Fetcher | undefined) {
  g.__dawriChargilyFetch = f;
}

export async function createCheckout(shop: Shop, months: number, lang: Lang, baseUrl: string): Promise<{ url: string }> {
  const c = chargilyConfig();
  if (!c.enabled) throw new DomainError("payments_unavailable", 503);
  const plan = plans().find((p) => p.months === months);
  if (!plan) throw new DomainError("invalid_plan");
  const body = {
    amount: plan.amount,
    currency: "dzd",
    payment_method: "edahabia",
    success_url: `${baseUrl}/staff/${shop.slug}/billing?paid=1`,
    failure_url: `${baseUrl}/staff/${shop.slug}/billing?failed=1`,
    webhook_endpoint: `${baseUrl}/api/billing/chargily`,
    description: `Dawri — ${shop.name} — ${months} mois`,
    locale: lang,
    chargily_pay_fees_allocation: "merchant",
    metadata: { shop_id: shop.id, months: String(months) },
  };
  const res = await (g.__dawriChargilyFetch ?? fetch)(`${c.base}/checkouts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.secret}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error("[chargily] create", res.status, (await res.text()).slice(0, 300));
    throw new DomainError("payment_failed", 502);
  }
  const data = (await res.json()) as { id?: string; checkout_url?: string };
  if (!data.id || !data.checkout_url) throw new DomainError("payment_failed", 502);
  const db = await getDb();
  await repo.insertPayment(db, {
    shopId: shop.id,
    provider: "chargily",
    checkoutId: data.id,
    amount: plan.amount,
    months,
    status: "pending",
    now: clockNow(),
  });
  return { url: data.checkout_url };
}

/** ترويسة `signature` = HMAC-SHA256 للجسم الخام بالمفتاح السرّي (hex). */
export function verifyChargilySignature(raw: string, signature: string | null): boolean {
  const { secret } = chargilyConfig();
  if (!signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** يعالج حدث Chargily (بعد التحقّق من التوقيع). متكرّر-الآمن: كلّ دفعة تمدّد مرّة واحدة. */
export async function handleChargilyEvent(event: { type?: string; data?: { id?: string; status?: string; amount?: number } }) {
  const id = event.data?.id;
  if (!id) return { ok: false };
  const db = await getDb();
  if (event.type === "checkout.paid" && event.data?.status === "paid") {
    const now = clockNow();
    const paid = await db.tx(async (q) => {
      const p = await repo.markPaymentPaid(q, id, now);
      if (!p) return null; // عولج من قبل أو غير معروف
      if (typeof event.data?.amount === "number" && event.data.amount < p.amount) {
        throw new Error(`chargily amount mismatch for ${id}`);
      }
      const until = await repo.extendSubscription(q, p.shopId, p.months, now);
      return { ...p, until };
    });
    return { ok: true, extended: Boolean(paid) };
  }
  if (event.type === "checkout.failed" || event.type === "checkout.canceled") {
    await repo.markPaymentFailed(db, id);
  }
  return { ok: true, extended: false };
}

/** تفعيل يدوي (بعد تحويل بريدي) — من لوحة الإدارة. */
export async function recordManualPayment(shopId: string, months: number, amount: number, note: string | null) {
  if (!Number.isInteger(months) || months < 1 || months > 24) throw new DomainError("invalid_plan");
  const db = await getDb();
  const now = clockNow();
  return db.tx(async (q) => {
    await repo.insertPayment(q, { shopId, provider: "manual", checkoutId: null, amount, months, status: "paid", note, now });
    return repo.extendSubscription(q, shopId, months, now);
  });
}
