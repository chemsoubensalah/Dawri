/**
 * اشتراك العيادة متعدّدة الأطبّاء (014_clinic_billing): منفصل عن اشتراك الطبيب الواحد وأغلى.
 * الطابور فعّال إن كان اشتراكه الخاصّ سارياً أو اشتراك عيادته — في JS وفي SQL (الدليل، التقارير).
 * PGlite، أو Postgres حقيقي عبر TEST_DATABASE_URL (بمخطّط خاصّ بهذا الملفّ).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPgDb, createPgliteDb, migrate, migrationsDir, setDb, type Db } from "@/lib/server/db";
import { setClock } from "@/lib/server/clock";
import { setNotifier } from "@/lib/server/notify";
import { setMailer, type Mail } from "@/lib/server/email";
import * as svc from "@/lib/server/service";
import * as clinics from "@/lib/server/clinics";
import * as repo from "@/lib/server/repo";
import * as crepo from "@/lib/server/clinicsRepo";
import * as rv from "@/lib/server/reviews";
import { sendDailyReports } from "@/lib/server/report";
import {
  createCheckout,
  createClinicCheckout,
  defaultAmount,
  handleChargilyEvent,
  paymentReference,
  plans,
  recordManualClinicPayment,
  setChargilyFetch,
} from "@/lib/server/billing";
import { POST as webhook } from "@/app/api/billing/chargily/route";
import { coveredByClinic, isSubscriptionActive, subscriptionUntil } from "@/lib/domain/subscription";
import { clinicPriceDzd, clinicPriceNumber, clinicYearPriceNumber, priceNumber } from "@/lib/pricing";
import type { Shop } from "@/lib/domain/types";
import type { Clinic } from "@/lib/server/clinicsRepo";

const SCHEMA = "clinic_billing_tests";
const DAY = 86_400_000;
const SECRET = "test_sk_clinic123";

let db: Db;
let clock = new Date("2026-10-11T07:00:00Z"); // الأحد 08:00 بالجزائر
const mails: Mail[] = [];
const requests: { url: string; body: Record<string, unknown> }[] = [];
let checkoutSeq = 0;

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.SIGNUP_CODE;
  delete process.env.NEXT_PUBLIC_PRICE_DZD;
  delete process.env.NEXT_PUBLIC_PRICE_YEAR_DZD;
  delete process.env.NEXT_PUBLIC_CLINIC_PRICE_DZD;
  delete process.env.NEXT_PUBLIC_CLINIC_PRICE_YEAR_DZD;
  process.env.CHARGILY_SECRET_KEY = SECRET;
  const url = process.env.TEST_DATABASE_URL;
  if (url) {
    const u = new URL(url);
    u.searchParams.set("options", `-c search_path=${SCHEMA}`);
    db = await createPgDb(u.toString());
    await db.exec(`drop schema if exists ${SCHEMA} cascade; create schema ${SCHEMA};`);
  } else {
    db = await createPgliteDb();
  }
  await migrate(db);
  setDb(db);
  setClock(() => clock);
  setNotifier({ send: async () => {} });
  setMailer({ send: async (m) => void mails.push(m) });
  setChargilyFetch(async (u, init) => {
    requests.push({ url: u, body: JSON.parse(String(init.body)) });
    const id = `01clk${++checkoutSeq}`;
    return new Response(JSON.stringify({ id, checkout_url: `https://pay.chargily.dz/test/checkouts/${id}/pay` }), { status: 200 });
  });
});

afterAll(async () => {
  delete process.env.CHARGILY_SECRET_KEY;
  setChargilyFetch(undefined);
  setDb(undefined);
  setClock(undefined);
  setNotifier(undefined);
  setMailer(undefined);
  if (process.env.TEST_DATABASE_URL) await db.exec(`drop schema if exists ${SCHEMA} cascade`);
  await db.close();
});

let n = 0;
let clinic: Clinic;
let doctor: Shop;

beforeEach(async () => {
  clock = new Date("2026-10-11T07:00:00Z");
  mails.length = 0;
  requests.length = 0;
  n++;
  const r = await clinics.createClinic({
    name: `مركز الشفاء ${n}`,
    slug: `cb-centre-${n}`,
    email: `centre${n}@example.com`,
    pin: "4321",
    doctor: { doctorName: "سليم", specialty: "طبّ عامّ" },
  });
  clinic = r.clinic;
  doctor = r.shop;
});

const fresh = async (s: Shop) => (await repo.getShopById(db, s.id))!;
const freshClinic = async () => (await crepo.getClinicById(db, clinic.id))!;
const past = () => new Date(clock.getTime() - 1000);
const expireShop = (id: string) => db.query("update shops set trial_ends_at = $2, paid_until = null where id = $1", [id, past()]);
const expireClinic = (id: string) => db.query("update clinics set trial_ends_at = $2, paid_until = null where id = $1", [id, past()]);
const sign = (raw: string) => crypto.createHmac("sha256", SECRET).update(raw).digest("hex");
const paidEvent = (id: string, amount: number) =>
  JSON.stringify({ id: `evt_${id}`, entity: "event", type: "checkout.paid", data: { id, entity: "checkout", amount, status: "paid", currency: "dzd" } });

let phoneSeq = 10;
const newPhone = () => `05510000${String(phoneSeq++).padStart(2, "0")}`;

/** رمز رفض أخذ رقم (أو null إن قُبل). */
async function blocker(slug: string): Promise<string | null> {
  try {
    await svc.requestCode(slug, { name: "مريض", phone: newPhone() });
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe("الأسعار والخطط", () => {
  it("العيادة أغلى: 2000 / 18000 افتراضياً، والطبيب الواحد 1000 / 9000", () => {
    expect(plans()).toEqual([
      { months: 1, amount: 1000 },
      { months: 12, amount: 9000 },
    ]);
    expect(plans("clinic")).toEqual([
      { months: 1, amount: 2000 },
      { months: 12, amount: 18000 },
    ]);
    expect(clinicPriceNumber()).toBeGreaterThan(priceNumber());
    expect(defaultAmount("clinic", 3)).toBe(6000);
    expect(defaultAmount("clinic", 12)).toBe(18000);
    expect(clinicPriceDzd()).toBe("2 000 DA");
  });

  it("من المتغيّرات NEXT_PUBLIC_CLINIC_PRICE_DZD / _YEAR_DZD", () => {
    process.env.NEXT_PUBLIC_CLINIC_PRICE_DZD = "2500";
    process.env.NEXT_PUBLIC_CLINIC_PRICE_YEAR_DZD = "24000";
    try {
      expect(plans("clinic")).toEqual([
        { months: 1, amount: 2500 },
        { months: 12, amount: 24000 },
      ]);
      expect(clinicYearPriceNumber()).toBe(24000);
      expect(plans()[0].amount).toBe(1000); // لا يمسّ خطّة الطبيب الواحد
    } finally {
      delete process.env.NEXT_PUBLIC_CLINIC_PRICE_DZD;
      delete process.env.NEXT_PUBLIC_CLINIC_PRICE_YEAR_DZD;
    }
    process.env.NEXT_PUBLIC_CLINIC_PRICE_DZD = "abc";
    try {
      expect(clinicPriceNumber()).toBe(2000);
    } finally {
      delete process.env.NEXT_PUBLIC_CLINIC_PRICE_DZD;
    }
  });
});

describe("الاشتراك الفعلي (الخاصّ أو العيادة)", () => {
  it("عيادة جديدة: تجربة 60 يوماً من ساعة التطبيق، والطبيب مشمول", async () => {
    expect(clinic.trialEndsAt.getTime() - clock.getTime()).toBe(60 * DAY);
    expect(clinic.paidUntil).toBeNull();
    const d = await fresh(doctor);
    expect(d.clinicId).toBe(clinic.id);
    expect(d.clinicUntil!.getTime()).toBe(clinic.trialEndsAt.getTime());
    expect(d.clinicName).toBe(clinic.name);
    expect(d.clinicSlug).toBe(clinic.slug);
  });

  it("اشتراكه الخاصّ سارٍ والعيادة منتهية ← فعّال", async () => {
    await expireClinic(clinic.id);
    const d = await fresh(doctor);
    expect(isSubscriptionActive(d, clock)).toBe(true);
    expect(coveredByClinic(d, clock)).toBe(false);
    expect(await blocker(d.slug)).toBeNull();
  });

  it("الخاصّ منتهٍ والعيادة سارية ← فعّال ومشمول بالعيادة", async () => {
    await expireShop(doctor.id);
    const d = await fresh(doctor);
    expect(isSubscriptionActive(d, clock)).toBe(true);
    expect(coveredByClinic(d, clock)).toBe(true);
    expect(subscriptionUntil(d).getTime()).toBe(clinic.trialEndsAt.getTime());
    expect(await blocker(d.slug)).toBeNull(); // ticketBlocker يستعمل حالة العيادة
    const st = await svc.staffState(d);
    expect(st.shop.active).toBe(true);
    expect(st.blocker).not.toBe("subscription");
    expect(st.shop.clinic).toMatchObject({ name: clinic.name, slug: clinic.slug, covers: true });
    expect(st.shop.until).toBe(clinic.trialEndsAt.toISOString());
  });

  it("كلاهما منتهٍ ← متوقّف (رفض «subscription»)", async () => {
    await expireShop(doctor.id);
    await expireClinic(clinic.id);
    const d = await fresh(doctor);
    expect(isSubscriptionActive(d, clock)).toBe(false);
    expect(await blocker(d.slug)).toBe("subscription");
    const st = await svc.staffState(d);
    expect(st.shop.active).toBe(false);
    expect(st.blocker).toBe("subscription");
    expect(st.shop.clinic).toMatchObject({ covers: false });
  });

  it("مغادرة العيادة (leaveClinic / removeDoctor / adminResetPin) ← يرجع إلى اشتراكه الخاصّ", async () => {
    await expireShop(doctor.id);
    expect(isSubscriptionActive(await fresh(doctor), clock)).toBe(true);
    await clinics.leaveClinic(await fresh(doctor));
    let d = await fresh(doctor);
    expect(d.clinicId).toBeNull();
    expect(d.clinicUntil).toBeNull();
    expect(isSubscriptionActive(d, clock)).toBe(false);
    expect(await blocker(d.slug)).toBe("subscription");
    expect((await svc.staffState(d)).shop.clinic).toBeNull();

    // removeDoctor: طبيب ثانٍ بمدّة مدفوعة خاصّة — تبقى له بعد الخروج
    const second = await clinics.addDoctor(await freshClinic(), { doctorName: "أمينة", slug: `cb-second-${n}`, pin: "5678" });
    await db.query("update shops set trial_ends_at = $2, paid_until = $3 where id = $1", [second.id, past(), new Date(clock.getTime() + 10 * DAY)]);
    await clinics.removeDoctor(await freshClinic(), second.slug);
    d = await fresh(second);
    expect(d.clinicId).toBeNull();
    expect(isSubscriptionActive(d, clock)).toBe(true);
    expect(subscriptionUntil(d).getTime()).toBe(clock.getTime() + 10 * DAY);

    // adminResetPin يفصل الطابور أيضاً
    const third = await clinics.addDoctor(await freshClinic(), { doctorName: "كريم", slug: `cb-third-${n}`, pin: "5678" });
    await expireShop(third.id);
    expect(isSubscriptionActive(await fresh(third), clock)).toBe(true);
    await svc.adminResetPin(third.id);
    expect(isSubscriptionActive(await fresh(third), clock)).toBe(false);
  });

  it("طابور منتهٍ ينضمّ إلى عيادة جديدة: تجربة العيادة لا تُحييه (فقط مدّتها المدفوعة)", async () => {
    // طبيب وحده انتهى اشتراكه قبل إنشاء العيادة الجديدة
    const solo = await svc.createShop({ name: "طبيب قديم", slug: `cb-old-${n}`, kind: "doctor", pin: "2468", email: "old@example.com" });
    await db.query("update shops set created_at = $2 where id = $1", [solo.id, new Date(Date.now() - 90 * DAY)]);
    await expireShop(solo.id);
    expect(await blocker(solo.slug)).toBe("subscription");
    // ينشئ عيادة جديدة (تجربة 60 يوماً) وينضمّ إليها برمزه
    const fresh2 = await clinics.createClinic({
      name: `مركز التحايل ${n}`,
      slug: `cb-trick-${n}`,
      email: "old@example.com",
      pin: "1357",
      doctor: { doctorName: "وهمي", slug: `cb-dummy-${n}` },
    });
    const joined = await clinics.joinDoctor(fresh2.clinic, { slug: solo.slug, pin: "2468" });
    expect(joined.clinicId).toBe(fresh2.clinic.id);
    expect(joined.clinicUntil).toBeNull();
    expect(isSubscriptionActive(joined, clock)).toBe(false);
    expect(await blocker(solo.slug)).toBe("subscription");
    const sqlActive = async (id: string) =>
      Boolean((await db.query(`select ${repo.activeShopSql("$2")} as a from shops s where s.id = $1`, [id, clock]))[0].a);
    expect(await sqlActive(solo.id)).toBe(false);
    // الطبيب المُنشأ داخل العيادة يبقى مشمولاً بتجربتها
    expect((await fresh(fresh2.shop)).clinicUntil!.getTime()).toBe(fresh2.clinic.trialEndsAt.getTime());
    // حين تدفع العيادة، يُغطّى الطابور المنضمّ أيضاً
    await recordManualClinicPayment(fresh2.clinic.id, 1, 2000, null);
    const paid = await fresh(solo);
    expect(isSubscriptionActive(paid, clock)).toBe(true);
    expect(await sqlActive(solo.id)).toBe(true);
    expect(await blocker(solo.slug)).toBeNull();
  });

  it("لوحة المدير: حالة اشتراك العيادة + نهاية فعلية لكلّ طبيب", async () => {
    await expireShop(doctor.id);
    const v = await clinics.managerView(await freshClinic());
    expect(v.subscription).toMatchObject({ active: true, trial: true, paidUntil: null, daysLeft: 60 });
    const doc = v.doctors.find((x) => x.slug === doctor.slug)!;
    expect(doc.subscription.active).toBe(true);
    expect(doc.subscription.until).toBe(clinic.trialEndsAt.toISOString());
    expect(doc.status).not.toBe("inactive");
    const pub = await clinics.clinicPublic(clinic.slug);
    expect(pub.doctors[0].status).not.toBe("inactive");
  });

  it("لوحة المدير: «تجربة/مدفوع» من المصدر الذي يحدّد النهاية", async () => {
    const card = async () => (await clinics.managerView(await freshClinic())).doctors.find((x) => x.slug === doctor.slug)!.subscription;
    // العيادة مدفوعة 30 يوماً، وتجربة الطبيب الخاصّة 55 يوماً ← النهاية من تجربة الطبيب ← «تجربة»
    await db.query("update clinics set trial_ends_at = $2, paid_until = $3 where id = $1", [clinic.id, past(), new Date(clock.getTime() + 30 * DAY)]);
    await db.query("update shops set trial_ends_at = $2, paid_until = null where id = $1", [doctor.id, new Date(clock.getTime() + 55 * DAY)]);
    expect(await card()).toMatchObject({ active: true, trial: true, daysLeft: 55 });
    // العكس: الطبيب مدفوع 10 أيّام، والعيادة في تجربة 50 يوماً ← «تجربة» (العيادة)
    await db.query("update clinics set trial_ends_at = $2, paid_until = null where id = $1", [clinic.id, new Date(clock.getTime() + 50 * DAY)]);
    await db.query("update shops set trial_ends_at = $2, paid_until = $3 where id = $1", [doctor.id, past(), new Date(clock.getTime() + 10 * DAY)]);
    expect(await card()).toMatchObject({ active: true, trial: true, daysLeft: 50 });
    // العيادة مدفوعة 40 يوماً والطبيب تجربة 5 أيّام ← «مدفوع»
    await db.query("update clinics set trial_ends_at = $2, paid_until = $3 where id = $1", [clinic.id, past(), new Date(clock.getTime() + 40 * DAY)]);
    await db.query("update shops set trial_ends_at = $2, paid_until = null where id = $1", [doctor.id, new Date(clock.getTime() + 5 * DAY)]);
    expect(await card()).toMatchObject({ active: true, trial: false, daysLeft: 40 });
  });

  it("مراجع التحويل اليدوي لا تلتبس بين عيادة وطابور", () => {
    expect(paymentReference("clinic", "nour")).toBe("DAWRI-CLINIC_NOUR");
    expect(paymentReference("cabinet", "c-nour")).toBe("DAWRI-C-NOUR");
    expect(paymentReference("cabinet", "clinic-nour")).not.toBe(paymentReference("clinic", "nour"));
  });
});

describe("دفع العيادة (Chargily)", () => {
  it("صفحة دفع بسعر العيادة، والبيانات الوصفية تحمل clinic_id", async () => {
    const r = await createClinicCheckout(await freshClinic(), 12, "fr", "https://dawri.example");
    expect(r.url).toMatch(/^https:\/\/pay\.chargily\.dz\//);
    expect(requests[0].body).toMatchObject({
      amount: 18000,
      currency: "dzd",
      locale: "fr",
      success_url: `https://dawri.example/c/${clinic.slug}/manage/billing?paid=1`,
      failure_url: `https://dawri.example/c/${clinic.slug}/manage/billing?failed=1`,
      webhook_endpoint: "https://dawri.example/api/billing/chargily",
      metadata: { clinic_id: clinic.id, months: "12" },
    });
    const ps = await crepo.listClinicPayments(db, clinic.id);
    expect(ps).toHaveLength(1);
    expect(ps[0]).toMatchObject({ status: "pending", months: 12, amount: 18000, clinicId: clinic.id, shopId: null });
    expect(await repo.listPayments(db, doctor.id)).toHaveLength(0);
    await expect(createClinicCheckout(clinic, 3, "fr", "https://dawri.example")).rejects.toMatchObject({ code: "invalid_plan" });
  });

  it("الطبيب الواحد يبقى بسعره (1000)", async () => {
    await createCheckout(await fresh(doctor), 1, "ar", "https://dawri.example");
    expect(requests[0].body).toMatchObject({ amount: 1000, metadata: { shop_id: doctor.id } });
  });

  it("checkout.paid: يمدّد العيادة بعد نهاية تجربتها، مرّة واحدة فقط (متكرّر-الآمن)", async () => {
    await createClinicCheckout(await freshClinic(), 1, "ar", "https://dawri.example");
    const id = `01clk${checkoutSeq}`;
    const raw = paidEvent(id, 2000);
    const res = await webhook(new Request("https://x", { method: "POST", body: raw, headers: { signature: sign(raw) } }));
    expect(res.status).toBe(200);
    const after = await freshClinic();
    const expected = new Date(clinic.trialEndsAt);
    expected.setUTCMonth(expected.getUTCMonth() + 1);
    expect(after.paidUntil!.getTime()).toBe(expected.getTime());
    // اشتراك الطبيب الخاصّ لم يُمسّ، والطبيب مشمول حتى نهاية المدّة المدفوعة
    const d = await fresh(doctor);
    expect(d.paidUntil).toBeNull();
    expect(d.clinicUntil!.getTime()).toBe(expected.getTime());
    // نفس الحدث مرّة ثانية: لا تمديد إضافي
    await webhook(new Request("https://x", { method: "POST", body: raw, headers: { signature: sign(raw) } }));
    expect(await handleChargilyEvent(JSON.parse(raw))).toEqual({ ok: true, extended: false });
    expect((await freshClinic()).paidUntil!.getTime()).toBe(expected.getTime());
    expect((await crepo.listClinicPayments(db, clinic.id))[0].status).toBe("paid");
  });

  it("مبلغ أقلّ من سعر العيادة لا يفعّل شيئاً", async () => {
    await createClinicCheckout(await freshClinic(), 1, "ar", "https://dawri.example");
    await expect(handleChargilyEvent(JSON.parse(paidEvent(`01clk${checkoutSeq}`, 1000)))).rejects.toThrow("mismatch");
    expect((await freshClinic()).paidUntil).toBeNull();
  });

  it("عيادة منتهية تدفع ← تبدأ المدّة من اليوم، ويعود الطابور", async () => {
    await expireShop(doctor.id);
    await expireClinic(clinic.id);
    expect(await blocker(doctor.slug)).toBe("subscription");
    await createClinicCheckout(await freshClinic(), 1, "ar", "https://dawri.example");
    expect(await handleChargilyEvent(JSON.parse(paidEvent(`01clk${checkoutSeq}`, 2000)))).toEqual({ ok: true, extended: true });
    const expected = new Date(clock);
    expected.setUTCMonth(expected.getUTCMonth() + 1);
    expect((await freshClinic()).paidUntil!.getTime()).toBe(expected.getTime());
    expect(await blocker(doctor.slug)).toBeNull();
  });
});

describe("التفعيل اليدوي للعيادة", () => {
  it("يسجّل دفعة للعيادة ويمدّد من الأبعد (الآن، التجربة، المدفوع)", async () => {
    const until = await recordManualClinicPayment(clinic.id, 3, 6000, "BaridiMob #42");
    const expected = new Date(clinic.trialEndsAt);
    expected.setUTCMonth(expected.getUTCMonth() + 3);
    expect(until!.getTime()).toBe(expected.getTime());
    const again = await recordManualClinicPayment(clinic.id, 1, 2000, null);
    expected.setUTCMonth(expected.getUTCMonth() + 1);
    expect(again!.getTime()).toBe(expected.getTime());
    const ps = await crepo.listClinicPayments(db, clinic.id);
    expect(ps).toHaveLength(2);
    expect(ps.every((p) => p.provider === "manual" && p.status === "paid" && p.clinicId === clinic.id && p.shopId === null)).toBe(true);
    expect(ps.map((p) => p.amount).sort()).toEqual([2000, 6000]);
    const v = await clinics.managerView(await freshClinic());
    expect(v.subscription).toMatchObject({ active: true, trial: false, paidUntil: expected.toISOString() });
  });

  it("يرفض خطّة غير صحيحة وعيادة غير موجودة", async () => {
    await expect(recordManualClinicPayment(clinic.id, 0, 0, null)).rejects.toMatchObject({ code: "invalid_plan" });
    await expect(recordManualClinicPayment(clinic.id, 25, 0, null)).rejects.toMatchObject({ code: "invalid_plan" });
    await expect(recordManualClinicPayment("00000000-0000-0000-0000-000000000000", 1, 2000, null)).rejects.toMatchObject({ code: "clinic_not_found" });
    await expect(recordManualClinicPayment("nope", 1, 2000, null)).rejects.toMatchObject({ code: "clinic_not_found" });
    expect(await crepo.listClinicPayments(db, clinic.id)).toHaveLength(0);
  });
});

describe("قيد صفّ الدفع", () => {
  it("الدافع طابور أو عيادة — واحد فقط", async () => {
    const ins = (shopId: string | null, clinicId: string | null) =>
      db.query("insert into payments (shop_id, clinic_id, provider, amount, months, status) values ($1, $2, 'manual', 1, 1, 'paid')", [shopId, clinicId]);
    await expect(ins(null, null)).rejects.toThrow();
    await expect(ins(doctor.id, clinic.id)).rejects.toThrow();
    await ins(doctor.id, null);
    await ins(null, clinic.id);
  });

  it("حذف العيادة يحذف مدفوعاتها (والأطبّاء يبقون باشتراكهم الخاصّ)", async () => {
    await recordManualClinicPayment(clinic.id, 1, 2000, null);
    await db.query("delete from clinics where id = $1", [clinic.id]);
    expect(await crepo.listClinicPayments(db, clinic.id)).toHaveLength(0);
    const d = await fresh(doctor);
    expect(d.clinicId).toBeNull();
    expect(isSubscriptionActive(d, clock)).toBe(true);
  });
});

describe("فلاتر SQL المشتركة (الدليل + التقارير)", () => {
  it("الدليل يعرض طابوراً مشمولاً باشتراك العيادة فقط", async () => {
    const tag = `cbdir${n}`;
    await svc.updateSettings(await fresh(doctor), { name: `عيادة ${tag}` });
    await rv.saveReviewSettings(await fresh(doctor), { public: true, listed: true });
    await expireShop(doctor.id);
    expect((await rv.directory({ q: tag })).entries.map((e) => e.slug)).toEqual([doctor.slug]);
    await expireClinic(clinic.id);
    expect((await rv.directory({ q: tag })).entries).toHaveLength(0);
    expect((await rv.directory({ q: tag })).total).toBe(0);
  });

  it("التقرير اليومي يُرسل لطابور مشمول بالعيادة، ولا يُرسل حين ينتهي الاثنان", async () => {
    const seed = (s: Shop) =>
      db.query(
        `insert into tickets (shop_id, day, number, name, phone, source, status, created_at, called_at, done_at)
         values ($1, '2026-10-10', 1, 'x', null, 'online', 'done', '2026-10-10T07:00:00Z', '2026-10-10T08:00:00Z', '2026-10-10T08:10:00Z')`,
        [s.id],
      );
    const second = await clinics.addDoctor(await freshClinic(), { doctorName: "أمينة", slug: `cb-rep-${n}`, pin: "5678" });
    await seed(doctor);
    await seed(second);
    clock = new Date("2026-10-11T02:00:00Z"); // 03:00 بالجزائر: تقرير الأمس
    await expireShop(doctor.id);
    await expireShop(second.id);
    await expireClinic(clinic.id);
    await sendDailyReports();
    expect(mails).toHaveLength(0); // كلاهما منتهٍ

    await recordManualClinicPayment(clinic.id, 1, 2000, null);
    await sendDailyReports();
    expect(mails.filter((m) => m.to === clinic.ownerEmail)).toHaveLength(2); // الطبيبان مشمولان
  });

  it("activeShopSql يطابق isSubscriptionActive", async () => {
    const solo = await svc.createShop({ name: "طبيب وحده", slug: `cb-solo-${n}`, kind: "doctor", pin: "4321", email: "solo@example.com" });
    await expireShop(solo.id);
    await expireShop(doctor.id);
    const sqlActive = async (id: string) =>
      Boolean((await db.query(`select ${repo.activeShopSql("$2")} as a from shops s where s.id = $1`, [id, clock]))[0].a);
    expect(await sqlActive(doctor.id)).toBe(true);
    expect(await sqlActive(solo.id)).toBe(false);
    expect(isSubscriptionActive(await fresh(doctor), clock)).toBe(true);
    expect(isSubscriptionActive(await fresh(solo), clock)).toBe(false);
  });
});

describe("listClinicsAdmin", () => {
  it("يعرض العيادة بعدد أطبّائها وحالة اشتراكها", async () => {
    const list = await crepo.listClinicsAdmin(db);
    const row = list.find((c) => c.id === clinic.id)!;
    expect(row.doctors).toBe(1);
    expect(row.trialEndsAt.getTime()).toBe(clinic.trialEndsAt.getTime());
    const shops = await repo.listShopsAdmin(db, new Date(0));
    const s = shops.find((x) => x.id === doctor.id)!;
    expect(s.clinicUntil!.getTime()).toBe(clinic.trialEndsAt.getTime());
  });
});

describe("الترحيل 014 (العيادات الموجودة)", () => {
  it("تجربة العيادة = الإنشاء + 60 يوماً، أو أطول تجربة لأطبّائها إن كانت أبعد؛ ويُعاد بأمان", async () => {
    const old = await createPgliteDb();
    try {
      const files = fs.readdirSync(migrationsDir()).filter((f) => f.endsWith(".sql")).sort();
      const sql = (f: string) => fs.readFileSync(path.join(migrationsDir(), f), "utf8");
      await old.exec("create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())");
      for (const f of files.filter((f) => f < "014")) await old.exec(sql(f));
      const created = new Date("2026-09-01T00:00:00Z");
      const [a] = await old.query<{ id: string }>(
        "insert into clinics (slug, name, pin_hash, created_at) values ('old-a', 'قديمة أ', 'x', $1) returning id",
        [created],
      );
      const [b] = await old.query<{ id: string }>(
        "insert into clinics (slug, name, pin_hash, created_at) values ('old-b', 'قديمة ب', 'x', $1) returning id",
        [created],
      );
      const later = new Date("2026-12-25T00:00:00Z"); // طبيب بتجربة أطول (مكافأة دعوة مثلاً)
      await old.query(
        `insert into shops (slug, name, kind, pin_hash, door_code, hours, settings, default_lang, trial_ends_at, clinic_id)
         values ('old-doc', 'عيادة قديمة', 'doctor', 'x', '123456', '{}', '{}', 'ar', $1, $2)`,
        [later, b.id],
      );
      await old.exec(sql("014_clinic_billing.sql"));
      await old.exec(sql("014_clinic_billing.sql")); // يُعاد بأمان
      const rows = await old.query<{ id: string; trial_ends_at: Date; paid_until: Date | null }>("select id, trial_ends_at, paid_until from clinics");
      const byId = new Map(rows.map((r) => [r.id, r]));
      expect(new Date(byId.get(a.id)!.trial_ends_at).getTime()).toBe(created.getTime() + 60 * DAY);
      expect(new Date(byId.get(b.id)!.trial_ends_at).getTime()).toBe(later.getTime());
      expect(byId.get(a.id)!.paid_until).toBeNull();
      // عيادة جديدة بلا قيمة صريحة: الافتراضي now() + 60 يوماً
      const [c] = await old.query<{ t: Date }>("insert into clinics (slug, name, pin_hash) values ('new-c', 'جديدة', 'x') returning trial_ends_at as t");
      expect(new Date(c.t).getTime()).toBeGreaterThan(Date.now() + 59 * DAY);
    } finally {
      await old.close();
    }
  });
});
