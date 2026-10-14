/**
 * اشتراك العيادة: Chargily Pay V2 (البطاقة الذهبية و CIB) + تحويل يدوي (بريدي موب / CCP).
 * Chargily لا يدعم الاقتطاع الشهري التلقائي، لذا كلّ دفعة = صفحة دفع لمرّة واحدة (شهر أو سنة).
 * لا نثق بصفحة النجاح: التفعيل فقط عند حدث checkout.paid الموقَّع.
 *
 * المتغيّرات: CHARGILY_SECRET_KEY (test_sk_… أو مفتاح live)، CHARGILY_API_BASE (اختياري).
 *
 * خطّتان منفصلتان: طابور طبيب واحد (shop) أو عيادة متعدّدة الأطبّاء (clinic، أغلى، اشتراك واحد لكلّ أطبّائها).
 * صفّ payments يحمل shop_id أو clinic_id (واحد فقط)؛ الـwebhook يمدّد الدافع المعنيّ.
 */
import crypto from "node:crypto";
import { DomainError, type Lang, type Shop } from "../domain/types";
import { clinicPriceNumber, clinicYearPriceNumber, priceNumber, yearPriceNumber, type PlanKind } from "../pricing";
import { now as clockNow } from "./clock";
import { getDb } from "./db";
import * as repo from "./repo";
import * as crepo from "./clinicsRepo";
import type { Clinic } from "./clinicsRepo";
import { rewardReferrerOnPayment } from "./referral";

export function chargilyConfig() {
  const secret = process.env.CHARGILY_SECRET_KEY ?? "";
  const base =
    process.env.CHARGILY_API_BASE ??
    (secret.startsWith("test_") ? "https://pay.chargily.net/test/api/v2" : "https://pay.chargily.net/api/v2");
  return { secret, base: base.replace(/\/$/, ""), enabled: Boolean(secret), test: secret.startsWith("test_") };
}

/** الخطط: شهري، أو سنوي بسعر مخفّض — لطبيب واحد (cabinet) أو لعيادة متعدّدة الأطبّاء (clinic). */
export function plans(kind: PlanKind = "cabinet") {
  return kind === "clinic"
    ? [
        { months: 1, amount: clinicPriceNumber() },
        { months: 12, amount: clinicYearPriceNumber() },
      ]
    : [
        { months: 1, amount: priceNumber() },
        { months: 12, amount: yearPriceNumber() },
      ];
}

/** سعر تفعيل يدوي لمدّة ما (12 شهراً = السعر السنوي). */
export function defaultAmount(kind: PlanKind, months: number): number {
  const [m, y] = plans(kind);
  return months === 12 ? y.amount : m.amount * months;
}

/**
 * مرجع التحويل اليدوي (BaridiMob/CCP) الذي يكتبه الدافع ليطابقه المؤسّس في /admin.
 * الشَّرطة السفلية «_» لا تظهر أبداً في slug ([a-z0-9-])، فلا يلتبس مرجع عيادة بمرجع طابور
 * (مثلاً عيادة «nour» وطابور «c-nour» أو «clinic-nour»).
 */
export function paymentReference(kind: "cabinet" | "clinic", slug: string): string {
  return kind === "clinic" ? `DAWRI-CLINIC_${slug.toUpperCase()}` : `DAWRI-${slug.toUpperCase()}`;
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

interface CheckoutTarget {
  payer: { shopId: string } | { clinicId: string };
  kind: PlanKind;
  /** مسار صفحة الاشتراك (للعودة بعد الدفع) */
  returnPath: string;
  label: string;
  metadata: Record<string, string>;
}

async function startCheckout(target: CheckoutTarget, months: number, lang: Lang, baseUrl: string): Promise<{ url: string }> {
  const c = chargilyConfig();
  if (!c.enabled) throw new DomainError("payments_unavailable", 503);
  const plan = plans(target.kind).find((p) => p.months === months);
  if (!plan) throw new DomainError("invalid_plan");
  const body = {
    amount: plan.amount,
    currency: "dzd",
    payment_method: "edahabia",
    success_url: `${baseUrl}${target.returnPath}?paid=1`,
    failure_url: `${baseUrl}${target.returnPath}?failed=1`,
    webhook_endpoint: `${baseUrl}/api/billing/chargily`,
    description: `Dawri — ${target.label} — ${months} mois`,
    locale: lang,
    chargily_pay_fees_allocation: "merchant",
    metadata: { ...target.metadata, months: String(months) },
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
    ...target.payer,
    provider: "chargily",
    checkoutId: data.id,
    amount: plan.amount,
    months,
    status: "pending",
    now: clockNow(),
  });
  return { url: data.checkout_url };
}

/** صفحة دفع لطابور طبيب واحد (سعر cabinet). */
export async function createCheckout(shop: Shop, months: number, lang: Lang, baseUrl: string): Promise<{ url: string }> {
  // طابور داخل عيادة متعدّدة الأطبّاء: يمكنه الدفع لنفسه (يبقى له حين يغادر)، بسعر الطبيب الواحد
  return startCheckout(
    {
      payer: { shopId: shop.id },
      kind: "cabinet",
      returnPath: `/staff/${shop.slug}/billing`,
      label: shop.name,
      metadata: { shop_id: shop.id },
    },
    months,
    lang,
    baseUrl,
  );
}

/** صفحة دفع لعيادة متعدّدة الأطبّاء (سعر clinic، يغطّي كلّ أطبّائها). */
export async function createClinicCheckout(clinic: Clinic, months: number, lang: Lang, baseUrl: string): Promise<{ url: string }> {
  return startCheckout(
    {
      payer: { clinicId: clinic.id },
      kind: "clinic",
      returnPath: `/c/${clinic.slug}/manage/billing`,
      label: `Clinique ${clinic.name}`,
      metadata: { clinic_id: clinic.id },
    },
    months,
    lang,
    baseUrl,
  );
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
      if (p.clinicId) {
        // اشتراك العيادة: لا مكافأة «ادعُ زميلاً» (الإحالات مرتبطة بطابور طبيب، لا بعيادة)
        const until = await crepo.extendClinicSubscription(q, p.clinicId, p.months, now);
        await repo.setPaymentPeriodEnd(q, p.id, until);
        return { ...p, until };
      }
      if (!p.shopId) throw new Error(`payment ${p.id} has no payer`);
      const until = await repo.extendSubscription(q, p.shopId, p.months, now);
      await repo.setPaymentPeriodEnd(q, p.id, until);
      await rewardReferrerOnPayment(q, p.shopId, now); // «ادعُ زميلاً»: أوّل دفعة فقط
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
  if (!Number.isInteger(amount) || amount < 0) throw new DomainError("invalid_plan");
  const db = await getDb();
  const now = clockNow();
  return db.tx(async (q) => {
    const pay = await repo.insertPayment(q, { shopId, provider: "manual", checkoutId: null, amount, months, status: "paid", note, now });
    const until = await repo.extendSubscription(q, shopId, months, now);
    await repo.setPaymentPeriodEnd(q, pay.id, until);
    if (amount > 0) await rewardReferrerOnPayment(q, shopId, now); // «ادعُ زميلاً»: دفعة حقيقية فقط
    return until;
  });
}

/**
 * لوحة المؤسّس: تصحيح مبلغ دفعة يدوية مسجّلة (مثلاً تفعيل مجاني سُجّل بسعر السنة).
 * يغيّر المداخيل فقط — مدّة الاشتراك تبقى كما هي، ومكافأة «ادعُ زميلاً» إن مُنحت لا تُسحب.
 */
export async function adminSetPaymentAmount(id: unknown, amount: unknown, note: unknown) {
  const pid = Number(id);
  const amt = Number(amount);
  if (!Number.isSafeInteger(pid) || pid < 1) throw new DomainError("not_found", 404);
  if (!Number.isInteger(amt) || amt < 0 || amt > 10_000_000) throw new DomainError("invalid_plan");
  const n = typeof note === "string" && note.trim() ? note.trim().slice(0, 200) : null;
  const db = await getDb();
  const p = await repo.setManualPaymentAmount(db, pid, amt, n);
  if (!p) throw new DomainError("not_found", 404);
  return { id: p.id, amount: p.amount };
}

/** تفعيل يدوي لعيادة متعدّدة الأطبّاء (تحويل بريدي) — من لوحة الإدارة. بلا مكافأة إحالة. */
export async function recordManualClinicPayment(clinicId: string, months: number, amount: number, note: string | null) {
  if (!Number.isInteger(months) || months < 1 || months > 24) throw new DomainError("invalid_plan");
  if (!Number.isInteger(amount) || amount < 0) throw new DomainError("invalid_plan");
  if (!/^[0-9a-f-]{36}$/i.test(clinicId)) throw new DomainError("clinic_not_found", 404);
  const db = await getDb();
  const now = clockNow();
  return db.tx(async (q) => {
    if (!(await crepo.getClinicById(q, clinicId))) throw new DomainError("clinic_not_found", 404);
    const pay = await repo.insertPayment(q, { clinicId, provider: "manual", checkoutId: null, amount, months, status: "paid", note, now });
    const until = await crepo.extendClinicSubscription(q, clinicId, months, now);
    await repo.setPaymentPeriodEnd(q, pay.id, until);
    return until;
  });
}
