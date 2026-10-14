/**
 * إحصائيات لوحة المؤسّس: عدّاد الزيارات المجهول + أرقام المرضى والأطبّاء والمداخيل.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgDb, createPgliteDb, migrate, setDb, type Db } from "@/lib/server/db";
import { setClock } from "@/lib/server/clock";
import * as svc from "@/lib/server/service";
import { adminSetPaymentAmount, recordManualPayment, recordManualClinicPayment } from "@/lib/server/billing";
import * as repo from "@/lib/server/repo";
import * as crepo from "@/lib/server/clinicsRepo";
import { adminStats, classifyDevice, classifyPath, classifySource, isBot, recordVisit, visitorId } from "@/lib/server/analytics";

let db: Db;
let clock = new Date("2026-10-13T09:30:00Z"); // 10:30 بتوقيت الجزائر
const SCHEMA = "analytics_tests";
const PHONE_UA = "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";
const PC_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.SIGNUP_CODE;
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
});

afterAll(async () => {
  setDb(undefined);
  setClock(undefined);
  if (process.env.TEST_DATABASE_URL) await db.exec(`drop schema if exists ${SCHEMA} cascade`);
  await db.close();
});

describe("التصنيف", () => {
  it("المسارات", () => {
    expect(classifyPath("/")).toEqual({ section: "home", shop: "" });
    expect(classifyPath("/s/dr-ali")).toEqual({ section: "shop", shop: "dr-ali" });
    expect(classifyPath("/d/dr-ali")).toEqual({ section: "tv", shop: "dr-ali" });
    expect(classifyPath("/t/123")).toEqual({ section: "ticket", shop: "" });
    expect(classifyPath("/admin")).toBeNull();
    expect(classifyPath("/api/x")).toBeNull();
    expect(classifyPath("/s/<script>")).toBeNull();
    expect(classifyPath("https://evil")).toBeNull();
  });
  it("المصدر والجهاز والروبوتات", () => {
    expect(classifySource("", false, "dawri.app")).toBe("direct");
    expect(classifySource("", true, "dawri.app")).toBe("qr");
    expect(classifySource("https://www.google.com/", false, "dawri.app")).toBe("google");
    expect(classifySource("https://l.facebook.com/x", false, "dawri.app")).toBe("facebook");
    expect(classifySource("https://dawri.app/doctors", false, "dawri.app")).toBe("internal");
    expect(classifySource("not a url", false, null)).toBe("direct");
    expect(classifyDevice(PHONE_UA)).toBe("mobile");
    expect(classifyDevice(PC_UA)).toBe("desktop");
    expect(classifyDevice("Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0)")).toBe("tv");
    expect(isBot("Googlebot/2.1")).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot(PHONE_UA)).toBe(false);
  });
  it("البصمة تتغيّر كلّ يوم ولا تحتوي الـ IP", () => {
    const a = visitorId("2026-10-13", "41.100.1.2", PHONE_UA);
    expect(a).toBe(visitorId("2026-10-13", "41.100.1.2", PHONE_UA));
    expect(a).not.toBe(visitorId("2026-10-14", "41.100.1.2", PHONE_UA));
    expect(a).not.toContain("41.100");
  });
});

describe("الإحصائيات", () => {
  it("تعدّ الزوّار والمرضى والأطبّاء والمداخيل", async () => {
    const shop = await svc.createShop({ name: "عيادة الإحصاء", slug: "stats-doc", pin: "4321", email: "stats@example.com" });
    // created_at تضعه قاعدة البيانات (الوقت الحقيقي): نثبّته على ساعة الاختبار كي لا يتعلّق الاختبار بتاريخ اليوم
    await db.query("update shops set created_at = $2 where id = $1", [shop.id, clock]);
    const base = { referrer: "", qr: false, ownHost: "dawri.app" };
    // زائر 1: صفحتان في الصفحة نفسها (زائر واحد، مشاهدتان) + صفحة أخرى
    await recordVisit({ ...base, path: "/s/stats-doc", ip: "41.1.1.1", ua: PHONE_UA, qr: true });
    await recordVisit({ ...base, path: "/s/stats-doc", ip: "41.1.1.1", ua: PHONE_UA });
    await recordVisit({ ...base, path: "/", ip: "41.1.1.1", ua: PHONE_UA });
    // زائر 2 من حاسوب عبر Google
    await recordVisit({ ...base, path: "/", ip: "41.2.2.2", ua: PC_UA, referrer: "https://www.google.com/" });
    // لا تُعدّ: روبوت ولوحة المؤسّس
    expect(await recordVisit({ ...base, path: "/", ip: "1.1.1.1", ua: "Googlebot/2.1" })).toBe(false);
    expect(await recordVisit({ ...base, path: "/admin", ip: "1.1.1.1", ua: PC_UA })).toBe(false);

    await db.query(
      `insert into tickets (shop_id, day, number, name, source, status, created_at, called_at) values
       ($1,'2026-10-13',1,'a','online','done','2026-10-13T08:00:00Z','2026-10-13T08:20:00Z'),
       ($1,'2026-10-13',2,'b','desk','no_show','2026-10-13T08:05:00Z',null),
       ($1,'2026-10-12',1,'c','online','done','2026-10-12T09:00:00Z','2026-10-12T09:40:00Z')`,
      [shop.id],
    );
    await recordManualPayment(shop.id, 1, 1000, null);

    const s = await adminStats(7);
    expect(s.days).toHaveLength(7);
    expect(s.days.at(-1)).toBe("2026-10-13");
    expect(s.kpi.visitors).toBe(3); // (زائر1، صفحة الطبيب) + (زائر1، الرئيسية) + (زائر2، الرئيسية)
    expect(s.kpi.views).toBe(4);
    expect(s.kpi.patients).toBe(3);
    expect(s.kpi.online).toBe(2);
    expect(s.kpi.served).toBe(2);
    expect(s.kpi.noShows).toBe(1);
    expect(s.kpi.waitMin).toBe(30);
    expect(s.kpi.signups).toBe(1);
    expect(s.kpi.revenue).toBe(1000);
    expect(s.activeDoctors).toBe(1);
    expect(s.totals).toMatchObject({ patients: 3, doctors: 1, revenue: 1000 });
    expect(s.ticketsDaily.at(-1)).toEqual({ day: "2026-10-13", online: 1, desk: 1 });
    expect(s.visitsDaily.at(-1)).toEqual({ day: "2026-10-13", visitors: 3, views: 4 });
    expect(s.revenueMonthly.at(-1)).toEqual({ month: "2026-10", amount: 1000 });
    expect(s.revenueMonthly).toHaveLength(12);
    expect(s.hours[9]).toBe(2); // 08:00Z = 09:00 بتوقيت الجزائر
    expect(s.weekdays[2]).toBe(2); // 2026-10-13 ثلاثاء
    expect(s.sources).toEqual(expect.arrayContaining([{ key: "qr", n: 1 }, { key: "google", n: 1 }]));
    expect(s.devices).toEqual(expect.arrayContaining([{ key: "mobile", n: 2 }, { key: "desktop", n: 1 }]));
    expect(s.topPages).toEqual([{ slug: "stats-doc", name: "عيادة الإحصاء", n: 1 }]);
    expect(s.topDoctors[0]).toMatchObject({ slug: "stats-doc", n: 3 });

    // الفترة السابقة فارغة؛ وبعد أسبوع تنتقل الأرقام إلى «السابقة»
    expect(s.prev.patients).toBe(0);
    clock = new Date("2026-10-20T09:30:00Z");
    const later = await adminStats(7);
    expect(later.kpi.patients).toBe(0);
    expect(later.prev.patients).toBe(3);
  });
});

describe("الهدايا (تفعيل مجاني) لا تُحسب في المداخيل", () => {
  it("هدية بـ 0 دج: الاشتراك يمتدّ، المداخيل لا تتغيّر، والطبيب «هدية» لا «يدفع»", async () => {
    clock = new Date("2026-11-02T09:30:00Z");
    const shop = await svc.createShop({ name: "عيادة الهدية", slug: "gift-doc", pin: "4321", email: "gift@example.com" });
    const before = (await adminStats(7)).kpi.revenue;
    const until = await recordManualPayment(shop.id, 12, 0, "هدية");
    expect(until!.getTime()).toBeGreaterThan(clock.getTime() + 300 * 86_400_000);
    expect((await adminStats(7)).kpi.revenue).toBe(before);
    const row = (await repo.listShopsAdmin(db, clock, clock)).find((x) => x.id === shop.id)!;
    expect(row.hasPaid).toBe(false);
    expect(row.paidUntil!.getTime()).toBeGreaterThan(clock.getTime());
  });

  it("تصحيح دفعة سُجّلت بالخطأ (9000 ← 0): تُحذف من المداخيل والمدّة تبقى", async () => {
    clock = new Date("2026-11-03T09:30:00Z");
    const shop = await svc.createShop({ name: "عيادة الخطأ", slug: "oops-doc", pin: "4321", email: "oops@example.com" });
    const base = (await adminStats(7)).kpi.revenue;
    const until = await recordManualPayment(shop.id, 12, 9000, null);
    expect((await adminStats(7)).kpi.revenue).toBe(base + 9000);
    expect((await repo.listShopsAdmin(db, clock, clock)).find((x) => x.id === shop.id)!.hasPaid).toBe(true);

    const pay = (await repo.listRecentPaymentsAdmin(db, 50)).find((p) => p.shopId === shop.id)!;
    expect(pay).toMatchObject({ amount: 9000, months: 12, payerName: "عيادة الخطأ", payerSlug: "oops-doc" });
    expect(await adminSetPaymentAmount(pay.id, 0, "هدية (صُحّحت)")).toEqual({ id: pay.id, amount: 0 });

    expect((await adminStats(7)).kpi.revenue).toBe(base);
    const row = (await repo.listShopsAdmin(db, clock, clock)).find((x) => x.id === shop.id)!;
    expect(row.hasPaid).toBe(false);
    expect(row.paidUntil!.getTime()).toBe(until!.getTime());
    expect((await repo.listRecentPaymentsAdmin(db, 50)).find((p) => p.id === pay.id)!.note).toBe("هدية (صُحّحت)");
  });

  it("التصحيح يرفض: مبلغ سالب أو غير صحيح، دفعة غير موجودة، دفعة غير يدوية", async () => {
    const shop = await svc.createShop({ name: "عيادة التحقّق", slug: "check-doc", pin: "4321", email: "check@example.com" });
    await recordManualPayment(shop.id, 1, 1000, null);
    const pay = (await repo.listRecentPaymentsAdmin(db, 50)).find((p) => p.shopId === shop.id)!;
    await expect(adminSetPaymentAmount(pay.id, -5, null)).rejects.toThrow("invalid_plan");
    await expect(adminSetPaymentAmount(pay.id, 1.5, null)).rejects.toThrow("invalid_plan");
    await expect(adminSetPaymentAmount(pay.id, "abc", null)).rejects.toThrow("invalid_plan");
    await expect(adminSetPaymentAmount(99999999, 0, null)).rejects.toThrow("not_found");
    await expect(adminSetPaymentAmount("x", 0, null)).rejects.toThrow("not_found");
    await expect(recordManualPayment(shop.id, 1, -1000, null)).rejects.toThrow("invalid_plan");
    // دفعة Chargily لا تُعدَّل من هنا
    await db.query("insert into payments (shop_id, provider, checkout_id, amount, months, status, paid_at) values ($1,'chargily','chk_1',1000,1,'paid',now())", [shop.id]);
    const chg = (await repo.listRecentPaymentsAdmin(db, 50)).find((p) => p.checkoutId === "chk_1")!;
    await expect(adminSetPaymentAmount(chg.id, 0, null)).rejects.toThrow("not_found");
  });

  it("«مدفوع» أو «هدية» حسب الفترة الحالية، لا حسب أيّ دفعة قديمة", async () => {
    const DAY = 86_400_000;
    const hasPaid = async (id: string) => (await repo.listShopsAdmin(db, clock, clock)).find((x) => x.id === id)!.hasPaid;

    // 1) دفع شهراً ثمّ انتهى، ثمّ هدية 12 شهراً ← «هدية» (لا «مدفوع»)
    clock = new Date("2026-11-10T09:00:00Z");
    const a = await svc.createShop({ name: "عيادة أ", slug: "period-a", pin: "4321", email: "pa@example.com" });
    await db.query("update shops set trial_ends_at = $2 where id = $1", [a.id, clock]); // بلا تجربة
    await recordManualPayment(a.id, 1, 1000, null);
    expect(await hasPaid(a.id)).toBe(true);
    clock = new Date(clock.getTime() + 100 * DAY); // انتهت الفترة المدفوعة
    expect(await hasPaid(a.id)).toBe(false);
    await recordManualPayment(a.id, 12, 0, "هدية");
    expect(await hasPaid(a.id)).toBe(false);

    // 2) سنة مدفوعة ثمّ شهر هدية ← «مدفوع» طوال السنة، ثمّ «هدية» في الشهر الأخير
    clock = new Date("2026-11-10T09:00:00Z");
    const b = await svc.createShop({ name: "عيادة ب", slug: "period-b", pin: "4321", email: "pb@example.com" });
    await db.query("update shops set trial_ends_at = $2 where id = $1", [b.id, clock]);
    await recordManualPayment(b.id, 12, 9000, null);
    await recordManualPayment(b.id, 1, 0, "هدية");
    clock = new Date(clock.getTime() + 300 * DAY);
    expect(await hasPaid(b.id)).toBe(true);
    clock = new Date(clock.getTime() + 80 * DAY); // داخل شهر الهدية (بعد نهاية السنة المدفوعة)
    expect(await hasPaid(b.id)).toBe(false);

    // 3) تجديد مبكّر: الفترة الجديدة تُضاف بعد الحالية ← «مدفوع» حتى آخرها
    clock = new Date("2026-11-10T09:00:00Z");
    const c = await svc.createShop({ name: "عيادة ج", slug: "period-c", pin: "4321", email: "pc@example.com" });
    await db.query("update shops set trial_ends_at = $2 where id = $1", [c.id, clock]);
    await recordManualPayment(c.id, 1, 1000, null);
    clock = new Date(clock.getTime() + 25 * DAY);
    await recordManualPayment(c.id, 1, 1000, null); // دفع قبل الانتهاء بأيّام
    clock = new Date(clock.getTime() + 30 * DAY); // داخل الشهر الثاني
    expect(await hasPaid(c.id)).toBe(true);

    // 4) دفع أثناء التجربة: الفترة تبدأ بعد التجربة، لكنّه «يدفع» من الآن
    clock = new Date("2026-11-10T09:00:00Z");
    const d = await svc.createShop({ name: "عيادة د", slug: "period-d", pin: "4321", email: "pd@example.com" });
    await recordManualPayment(d.id, 1, 1000, null);
    expect(await hasPaid(d.id)).toBe(true);
  });

  it("عيادة متعدّدة الأطبّاء: هدية = «هدية»، دفعة = «تدفع»", async () => {
    const { createClinic } = await import("@/lib/server/clinics");
    const { clinic } = await createClinic({ name: "عيادة الأمل", slug: "amal-clinic", email: "amal@example.com", pin: "7777", doctor: { doctorName: "سليم" } });
    await recordManualClinicPayment(clinic.id, 12, 0, "هدية");
    let row = (await crepo.listClinicsAdmin(db, clock)).find((c) => c.id === clinic.id)!;
    expect(row.hasPaid).toBe(false);
    await recordManualClinicPayment(clinic.id, 1, 2000, null);
    row = (await crepo.listClinicsAdmin(db, clock)).find((c) => c.id === clinic.id)!;
    expect(row.hasPaid).toBe(true);
    expect((await repo.listRecentPaymentsAdmin(db, 50)).find((p) => p.clinicId === clinic.id && p.amount === 2000)).toMatchObject({ payerName: "عيادة الأمل", payerSlug: "amal-clinic" });
  });
});
