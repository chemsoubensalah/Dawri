/**
 * التقييمات ودليل العيادات — على Postgres حقيقي (PGlite أو TEST_DATABASE_URL).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPgDb, createPgliteDb, migrate, setDb, type Db } from "@/lib/server/db";
import { setClock } from "@/lib/server/clock";
import { setNotifier } from "@/lib/server/notify";
import * as svc from "@/lib/server/service";
import * as repo from "@/lib/server/repo";
import * as rv from "@/lib/server/reviews";
import { WILAYAS } from "@/lib/domain/wilayas";
import { dicts } from "@/lib/i18n";
import type { Shop } from "@/lib/domain/types";

let db: Db;
let clock = new Date("2026-10-11T07:00:00Z"); // الأحد 08:00 بتوقيت الجزائر
const advance = (m: number) => (clock = new Date(clock.getTime() + m * 60000));

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.SIGNUP_CODE;
  const url = process.env.TEST_DATABASE_URL;
  if (url) {
    db = await createPgDb(url);
    await db.exec("drop schema public cascade; create schema public;");
  } else {
    db = await createPgliteDb();
  }
  await migrate(db);
  setDb(db);
  setClock(() => clock);
  setNotifier({ send: async () => {} });
});

afterAll(async () => {
  setDb(undefined);
  setClock(undefined);
  setNotifier(undefined);
  await db.close();
});

let shop: Shop;
let n = 0;
let phoneSeq = 10;
const newPhone = () => `05510000${String(phoneSeq++).padStart(2, "0")}`;

beforeEach(async () => {
  clock = new Date("2026-10-11T07:00:00Z");
  shop = await svc.createShop({ name: `عيادة ${n}`, slug: `rv-clinic-${++n}`, kind: "doctor", pin: "4321", email: "dr@example.com" });
});

async function take(s: Shop = shop) {
  const phone = newPhone();
  const c = await svc.requestCode(s.slug, { name: "زبون", phone });
  return svc.takeTicket(s.slug, { name: "زبون", phone, code: c.devCode });
}

async function fresh(s: Shop = shop) {
  return (await repo.getShopBySlug(db, s.slug))!;
}

async function next(s: Shop = shop) {
  const f = await fresh(s);
  const st = await svc.staffState(f);
  return svc.staffAction(f, { action: "next", current: st.current?.id ?? null });
}

/** تذكرة خُدمت (نوديت ثمّ انتهت). */
async function servedTicket(s: Shop = shop) {
  const tk = await take(s);
  await next(s); // ينادي
  advance(3);
  await next(s); // ينهي
  const t = await repo.getTicket(db, tk.ticketId);
  expect(t!.status).toBe("done");
  return tk.ticketId;
}

describe("تقييم المريض", () => {
  it("لا تقييم قبل انتهاء الزيارة", async () => {
    const tk = await take();
    expect(await rv.reviewState(tk.ticketId)).toEqual({ state: "none" });
    await expect(rv.submitReview(tk.ticketId, { rating: 5 })).rejects.toMatchObject({ code: "review_not_allowed" });
  });

  it("بعد الخدمة: تقييم واحد، وإعادة الإرسال نفسها ناجحة (شبكة ضعيفة)", async () => {
    const id = await servedTicket();
    const st = await rv.reviewState(id);
    expect(st.state).toBe("open");
    expect(await rv.submitReview(id, { rating: 5, comment: "  ممتاز\u0000 جدّاً‮ " })).toEqual({ ok: true, rating: 5 });
    const rows = await db.query<{ comment: string }>("select comment from reviews where ticket_id = $1", [id]);
    expect(rows[0].comment).toBe("ممتاز جدّاً");
    expect(await rv.submitReview(id, { rating: 5, comment: "ممتاز جدّاً" })).toEqual({ ok: true, rating: 5 });
    await expect(rv.submitReview(id, { rating: 1 })).rejects.toMatchObject({ code: "review_exists", status: 409 });
    expect(await rv.reviewState(id)).toMatchObject({ state: "sent", rating: 5 });
  });

  it("طلبات متزامنة لنفس التذكرة لا تُنشئ تقييمين", async () => {
    const id = await servedTicket();
    const r = await Promise.allSettled([1, 2, 3, 4].map((k) => rv.submitReview(id, { rating: k + 1 })));
    expect(r.filter((x) => x.status === "fulfilled").length).toBe(1);
    const rows = await db.query("select id from reviews where ticket_id = $1", [id]);
    expect(rows.length).toBe(1);
  });

  it("يرفض المدخلات غير الصالحة", async () => {
    const id = await servedTicket();
    for (const rating of [0, 6, 2.5, "x", null]) {
      await expect(rv.submitReview(id, { rating })).rejects.toMatchObject({ code: "review_invalid" });
    }
    await expect(rv.submitReview(id, { rating: 4, comment: "ب".repeat(301) })).rejects.toMatchObject({ code: "review_too_long" });
    await expect(rv.submitReview(id, { rating: 4, comment: 42 })).rejects.toMatchObject({ code: "review_invalid" });
    await expect(rv.submitReview("not-a-uuid", { rating: 4 })).rejects.toMatchObject({ status: 404 });
    await expect(rv.submitReview("00000000-0000-4000-8000-000000000000", { rating: 4 })).rejects.toMatchObject({ status: 404 });
    // 300 حرف بالضبط مقبولة، والتعليق الفارغ = بلا تعليق
    expect(await rv.submitReview(id, { rating: 4, comment: "ب".repeat(300) })).toMatchObject({ ok: true });
  });

  it("المهلة 72 ساعة بعد الخدمة", async () => {
    const id = await servedTicket();
    advance(72 * 60 - 1);
    expect((await rv.reviewState(id)).state).toBe("open");
    advance(2);
    expect(await rv.reviewState(id)).toEqual({ state: "none" });
    await expect(rv.submitReview(id, { rating: 5 })).rejects.toMatchObject({ code: "review_expired" });
  });

  it("الاشتراك المنتهي يوقف التقييم كما يوقف التذاكر", async () => {
    const id = await servedTicket();
    await db.query("update shops set trial_ends_at = $2, paid_until = null where id = $1", [shop.id, new Date(clock.getTime() - 1000)]);
    expect(await rv.reviewState(id)).toEqual({ state: "none" });
    await expect(rv.submitReview(id, { rating: 5 })).rejects.toMatchObject({ code: "subscription" });
  });

  it("رابط Google يُعاد مع الحالة إن وُجد", async () => {
    await svc.updateSettings(await fresh(), { profile: { ...shop.profile, mapsUrl: "https://maps.app.goo.gl/abc" } });
    const id = await servedTicket();
    expect(await rv.reviewState(id)).toMatchObject({ state: "open", mapsUrl: "https://maps.app.goo.gl/abc" });
  });

  it("التقييم يبقى بعد تجهيل التذكرة (لا يحمل اسماً)", async () => {
    const id = await servedTicket();
    await rv.submitReview(id, { rating: 4 });
    advance(31 * 24 * 60);
    await svc.runCron();
    const t = await repo.getTicket(db, id);
    expect(t!.phone).toBeNull();
    const s = await rv.staffReviews(await fresh());
    expect(s.count).toBe(1);
  });
});

describe("لوحة الطبيب", () => {
  it("المعدّل والتوزيع وآخر التعليقات، والإخفاء لصاحب العيادة فقط", async () => {
    const ratings = [5, 5, 4, 2];
    for (const r of ratings) await rv.submitReview(await servedTicket(), { rating: r, comment: r === 2 ? "انتظار طويل" : null });
    const s = await rv.staffReviews(await fresh());
    expect(s.count).toBe(4);
    expect(s.avg).toBe(4);
    expect(s.dist).toEqual([2, 1, 0, 1, 0]);
    expect(s.comments).toHaveLength(1);
    expect(JSON.stringify(s)).not.toContain("زبون"); // بلا أسماء
    const cid = s.comments[0].id;

    const other = await svc.createShop({ name: "أخرى", slug: `rv-other-${n}`, kind: "doctor", pin: "4321", email: "x@example.com" });
    await expect(rv.setReviewHidden(other, cid, true)).rejects.toMatchObject({ code: "review_not_found" });
    await expect(rv.setReviewHidden(shop, "x", true)).rejects.toMatchObject({ code: "bad_request" });

    await rv.setReviewHidden(shop, cid, true);
    const s2 = await rv.staffReviews(await fresh());
    expect(s2.comments[0].hidden).toBe(true);
    expect(s2.avg).toBe(4); // النجوم تبقى في المعدّل
  });

  it("المعدّل العامّ: فقط إن سمح الطبيب ومن 3 تقييمات", async () => {
    for (const r of [5, 4]) await rv.submitReview(await servedTicket(), { rating: r });
    expect(await rv.publicRating(shop.id)).toBeNull();
    await rv.saveReviewSettings(shop, { public: true, listed: false });
    expect(await rv.publicRating(shop.id)).toBeNull(); // تقييمان فقط
    await rv.submitReview(await servedTicket(), { rating: 5 });
    expect(await rv.publicRating(shop.id)).toEqual({ avg: 4.7, count: 3 });
    expect((await svc.publicShop(shop.slug)).view.rating).toEqual({ avg: 4.7, count: 3 });
    await rv.saveReviewSettings(shop, { public: false, listed: false });
    expect((await svc.publicShop(shop.slug)).view.rating).toBeNull();
    await expect(rv.saveReviewSettings(shop, { public: "yes", listed: false })).rejects.toMatchObject({ code: "invalid_settings" });
  });
});

describe("الولاية في ملفّ العيادة", () => {
  it("تُحفظ وتُتحقّق", async () => {
    expect(WILAYAS).toHaveLength(58);
    await svc.updateSettings(await fresh(), { profile: { ...shop.profile, wilaya: 16 } });
    expect((await fresh()).profile.wilaya).toBe(16);
    await svc.updateSettings(await fresh(), { profile: { ...shop.profile, wilaya: "31" } });
    expect((await fresh()).profile.wilaya).toBe(31);
    for (const w of [0, 59, 1.5, "abc"]) {
      await expect(svc.updateSettings(await fresh(), { profile: { ...shop.profile, wilaya: w } })).rejects.toMatchObject({ code: "invalid_settings" });
    }
    await svc.updateSettings(await fresh(), { profile: { ...shop.profile, wilaya: null } });
    expect((await fresh()).profile.wilaya).toBeNull();
  });
});

describe("دليل العيادات", () => {
  it("يعرض المسجّلة ذات الاشتراك الساري فقط، مع الحالة والانتظار الحيّ", async () => {
    const tag = `dir${n}`;
    await svc.updateSettings(await fresh(), { name: `عيادة ${tag} الأولى`, profile: { ...shop.profile, doctorName: "سليم", specialty: "طبّ الأطفال", wilaya: 16 } });
    await rv.saveReviewSettings(shop, { public: true, listed: true });
    // غير مسجّلة
    const hidden = await svc.createShop({ name: `عيادة ${tag} مخفيّة`, slug: `rv-hid-${n}`, kind: "doctor", pin: "4321", email: "x@example.com" });
    // مسجّلة لكن اشتراكها منتهٍ
    const expired = await svc.createShop({ name: `عيادة ${tag} منتهية`, slug: `rv-exp-${n}`, kind: "doctor", pin: "4321", email: "x@example.com" });
    await rv.saveReviewSettings(expired, { public: true, listed: true });
    await db.query("update shops set trial_ends_at = $2 where id = $1", [expired.id, new Date(clock.getTime() - 1000)]);
    void hidden;

    // 3 في الانتظار + واحد عند الطبيب منذ 4 دقائق (المدّة الافتراضية 10)
    for (let i = 0; i < 4; i++) await take();
    await next();
    advance(4);

    const r = await rv.directory({ q: tag });
    expect(r.entries.map((e) => e.slug)).toEqual([shop.slug]);
    const e = r.entries[0];
    expect(e.status).toBe("open");
    expect(e.waiting).toBe(3);
    expect(e.waitMin).toBe(36); // (10-4) + 3×10
    expect(e.rating).toBeNull(); // أقلّ من 3 تقييمات
    expect(e.profile.wilaya).toBe(16);

    // البحث بالطبيب والتخصّص، والتصفية بالولاية
    expect((await rv.directory({ q: "سليم", wilaya: "16" })).entries.some((x) => x.slug === shop.slug)).toBe(true);
    expect((await rv.directory({ q: "الأطفال" })).entries.some((x) => x.slug === shop.slug)).toBe(true);
    expect((await rv.directory({ q: tag, wilaya: 31 })).entries).toHaveLength(0);
    // رموز LIKE لا تُطابق كلّ شيء
    expect((await rv.directory({ q: "%" })).entries).toHaveLength(0);
    expect((await rv.directory({ q: "_" })).entries).toHaveLength(0);
  });

  it("استراحة/مغلق حسب الساعات وإغلاق اليوم", async () => {
    const tag = `brk${n}`;
    await svc.updateSettings(await fresh(), {
      name: `عيادة ${tag}`,
      hours: { "0": [["06:00", "08:00"], ["10:00", "16:00"]] },
    });
    await rv.saveReviewSettings(shop, { public: false, listed: true });
    let e = (await rv.directory({ q: tag })).entries[0];
    expect(e.status).toBe("break");
    expect(e.opensAt).toBe("10:00");
    clock = new Date("2026-10-11T04:00:00Z"); // 05:00
    e = (await rv.directory({ q: tag })).entries[0];
    expect(e.status).toBe("later");
    clock = new Date("2026-10-11T16:00:00Z"); // 17:00
    e = (await rv.directory({ q: tag })).entries[0];
    expect(e.status).toBe("closed");
    expect(e.waitMin).toBeNull();
    clock = new Date("2026-10-11T10:00:00Z"); // 11:00 لكن الطبيب أغلق اليوم
    await repo.lockDay(db, shop.id, "2026-10-11");
    await repo.setDayClosed(db, shop.id, "2026-10-11", true);
    e = (await rv.directory({ q: tag })).entries[0];
    expect(e.status).toBe("closed");
  });

  it("الترقيم والحدود", async () => {
    const tag = `pg${n}`;
    for (let i = 0; i < 5; i++) {
      const s = await svc.createShop({ name: `عيادة ${tag} ${i}`, slug: `rv-pg-${n}-${i}`, kind: "doctor", pin: "4321", email: "x@example.com" });
      await rv.saveReviewSettings(s, { public: false, listed: true });
    }
    const p1 = await rv.directory({ q: tag, pageSize: 2 });
    expect(p1.total).toBe(5);
    expect(p1.pages).toBe(3);
    const p3 = await rv.directory({ q: tag, pageSize: 2, page: "3" });
    expect(p3.entries).toHaveLength(1);
    expect((await rv.directory({ q: tag, page: "-4" })).page).toBe(1);
    expect((await rv.directory({ q: tag, pageSize: 999 })).entries.length).toBeLessThanOrEqual(50);
    expect(rv.cleanDirectoryQuery({ q: "x".repeat(500) }).q.length).toBe(60);
  });
});

describe("النصوص", () => {
  it("كلّ مفاتيح rv_ وأخطاء التقييم موجودة باللغتين", () => {
    for (const k of Object.keys(dicts.ar).filter((k) => k.startsWith("rv_") || k.startsWith("err_review"))) {
      expect(dicts.fr[k as keyof typeof dicts.fr], k).toBeTruthy();
    }
    for (const code of ["review_invalid", "review_too_long", "review_exists", "review_not_allowed", "review_expired", "review_rate", "review_not_found"]) {
      expect(`err_${code}` in dicts.ar, code).toBe(true);
    }
  });
});
