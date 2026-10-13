/**
 * النموّ: التقرير اليومي + «ادعُ زميلاً» — على Postgres حقيقي (PGlite أو TEST_DATABASE_URL).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPgDb, createPgliteDb, migrate, setDb, type Db } from "@/lib/server/db";
import { setClock } from "@/lib/server/clock";
import { setNotifier } from "@/lib/server/notify";
import { setMailer, type Mail } from "@/lib/server/email";
import * as svc from "@/lib/server/service";
import * as repo from "@/lib/server/repo";
import { recordManualPayment } from "@/lib/server/billing";
import {
  computeDayReport,
  renderReport,
  sendDailyReports,
  sendReportPreview,
  saveReportSettings,
  formatSaved,
  REPORT_CONCURRENCY,
} from "@/lib/server/report";
import { ensureReferralCode, referralStats } from "@/lib/server/referral";
import type { Shop } from "@/lib/domain/types";

let db: Db;
let clock = new Date("2026-10-11T07:00:00Z");
const mails: Mail[] = [];
let failMail = false;
let mailDelayMs = 0;
let inFlight = 0;
let maxInFlight = 0;
const DAY = 86_400_000;

const SCHEMA = "growth_tests";

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.SIGNUP_CODE;
  const url = process.env.TEST_DATABASE_URL;
  if (url) {
    // مخطّط خاصّ بهذا الملفّ: لا يتصادم مع الملفّات الأخرى التي تعمل بالتوازي على نفس القاعدة
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
  setMailer({
    send: async (m) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        if (mailDelayMs) await new Promise((r) => setTimeout(r, mailDelayMs));
        if (failMail) throw new Error("smtp down");
        mails.push(m);
      } finally {
        inFlight--;
      }
    },
  });
});

afterAll(async () => {
  setDb(undefined);
  setClock(undefined);
  setNotifier(undefined);
  setMailer(undefined);
  if (process.env.TEST_DATABASE_URL) await db.exec(`drop schema if exists ${SCHEMA} cascade`);
  await db.close();
});

let n = 0;
async function newShop(email: string | null = "", ref?: string): Promise<Shop> {
  const id = ++n;
  const shop = await svc.createShop({ name: "عيادة النموّ", slug: `growth-${id}`, pin: "4321", email: email || `dr${id}@example.com`, ref });
  if (email !== null) return shop;
  await db.query("update shops set owner_email = null where id = $1", [shop.id]);
  return { ...shop, ownerEmail: null };
}

/** يُدخل تذكرة مباشرة بتواريخ محدّدة (UTC). */
async function seed(shop: Shop, day: string, num: number, o: { source: "online" | "desk"; status: string; created: string; called?: string; done?: string }) {
  await db.query(
    `insert into tickets (shop_id, day, number, name, phone, source, status, created_at, called_at, done_at)
     values ($1,$2,$3,'x',null,$4,$5,$6,$7,$8)`,
    [shop.id, day, num, o.source, o.status, o.created, o.called ?? null, o.done ?? null],
  );
}

beforeEach(() => {
  clock = new Date("2026-10-11T07:00:00Z");
  mails.length = 0;
  failMail = false;
  mailDelayMs = 0;
  maxInFlight = 0;
});

const served = (day: string) => ({ source: "desk" as const, status: "done", created: `${day}T07:00:00Z`, called: `${day}T07:05:00Z`, done: `${day}T07:15:00Z` });
const logRow = async (shop: Shop, day: string) =>
  (await db.query<{ claimed_at: Date; sent_at: Date | null }>("select claimed_at, sent_at from report_log where shop_id = $1 and day = $2", [shop.id, day]))[0];

describe("التقرير اليومي", () => {
  it("يحسب أرقام الأمس ويقارن بنفس اليوم من الأسبوع الماضي", async () => {
    const shop = await newShop();
    // السبت 2026-10-10 (الجزائر = UTC+1)
    await seed(shop, "2026-10-10", 1, { source: "online", status: "done", created: "2026-10-10T07:00:00Z", called: "2026-10-10T08:30:00Z", done: "2026-10-10T08:40:00Z" });
    await seed(shop, "2026-10-10", 2, { source: "online", status: "done", created: "2026-10-10T07:10:00Z", called: "2026-10-10T08:40:00Z", done: "2026-10-10T09:00:00Z" });
    await seed(shop, "2026-10-10", 3, { source: "desk", status: "done", created: "2026-10-10T08:00:00Z", called: "2026-10-10T09:00:00Z", done: "2026-10-10T09:30:00Z" });
    await seed(shop, "2026-10-10", 4, { source: "online", status: "no_show", created: "2026-10-10T09:00:00Z", called: "2026-10-10T09:30:00Z" });
    // الأسبوع الماضي: مريضان خُدما
    await seed(shop, "2026-10-03", 1, { source: "desk", status: "done", created: "2026-10-03T07:00:00Z", called: "2026-10-03T07:10:00Z", done: "2026-10-03T07:20:00Z" });
    await seed(shop, "2026-10-03", 2, { source: "desk", status: "done", created: "2026-10-03T07:00:00Z", called: "2026-10-03T07:20:00Z", done: "2026-10-03T07:30:00Z" });

    const r = await computeDayReport(db, shop.id, "2026-10-10");
    expect(r).toMatchObject({ total: 4, served: 3, online: 3, desk: 1, noShows: 1, lastWeekServed: 2, changePct: 50 });
    // الانتظار: 90, 90, 60, 30 ← 68 ؛ الفحص: 10, 20, 30 ← 20
    expect(r.avgWaitMin).toBe(68);
    expect(r.avgServiceMin).toBe(20);
    expect(r.busiestHour).toBe(8); // 07:00Z و 07:10Z = 08 بتوقيت الجزائر
    expect(r.savedMin).toBe(90 + 90 + 30);
    expect(formatSaved("ar", r.savedMin)).toBe("3 سا 30 د");
    expect(formatSaved("fr", 120)).toBe("2 h");

    const m = renderReport(shop, r, "https://dawri.test");
    expect(m.to).toBe(shop.ownerEmail);
    expect(m.html).toContain('dir="rtl"');
    expect(m.html).toContain(`https://dawri.test/staff/${shop.slug}/settings#report`);
    expect(m.text).toContain("3 سا 30 د");
    expect(m.text).toContain("▲ 50٪");
    expect(m.html).not.toContain("<script");
  });

  it("يرسل مرّة واحدة لكلّ يوم، ويتخطّى المعطّل وبلا بريد وبلا تذاكر والمنتهي اشتراكه", async () => {
    const ok = await newShop();
    const off = await newShop();
    const noEmail = await newShop(null);
    const empty = await newShop();
    const expired = await newShop();
    for (const s of [ok, off, noEmail, expired]) {
      await seed(s, "2026-10-10", 1, { source: "online", status: "done", created: "2026-10-10T07:00:00Z", called: "2026-10-10T08:00:00Z", done: "2026-10-10T08:10:00Z" });
    }
    await saveReportSettings(off, { daily: false });
    await db.query("update shops set trial_ends_at = $2 where id = $1", [expired.id, new Date("2026-10-01T00:00:00Z")]);
    void empty;

    clock = new Date("2026-10-11T02:00:00Z"); // 03:00 بتوقيت الجزائر
    const r = await svc.runCron();
    expect(r.reports?.day).toBe("2026-10-10");
    const to = mails.map((m) => m.to);
    expect(to).toContain(ok.ownerEmail);
    expect(to).not.toContain(off.ownerEmail);
    expect(to).not.toContain(empty.ownerEmail);
    expect(to).not.toContain(expired.ownerEmail);
    expect(mails.filter((m) => m.to === ok.ownerEmail)).toHaveLength(1);

    mails.length = 0;
    await sendDailyReports();
    expect(mails.filter((m) => m.to === ok.ownerEmail)).toHaveLength(0); // متكرّر-الآمن
  });

  it("فشل البريد لا يكسر المهامّ الدورية، ويُعاد المحاولة لاحقاً", async () => {
    const s = await newShop();
    await seed(s, "2026-10-12", 1, { source: "desk", status: "done", created: "2026-10-12T07:00:00Z", called: "2026-10-12T07:05:00Z", done: "2026-10-12T07:15:00Z" });
    clock = new Date("2026-10-13T02:00:00Z");
    failMail = true;
    const r = await svc.runCron();
    expect(r.reports?.failed).toBeGreaterThanOrEqual(1);
    failMail = false;
    await sendDailyReports();
    expect(mails.filter((m) => m.to === s.ownerEmail)).toHaveLength(1);
  });

  it("المعاينة: إلى بريد الاستعادة فقط، 3 مرّات في اليوم", async () => {
    const s = await newShop();
    for (let i = 0; i < 3; i++) await sendReportPreview(s);
    expect(mails).toHaveLength(3);
    await expect(sendReportPreview(s)).rejects.toMatchObject({ code: "report_rate_limited" });
    clock = new Date(clock.getTime() + DAY + 60_000);
    await sendReportPreview(s);
    const bare = await newShop(null);
    await expect(sendReportPreview(bare)).rejects.toMatchObject({ code: "report_no_email" });
    await expect(saveReportSettings(s, { daily: "no" })).rejects.toMatchObject({ code: "bad_request" });
  });
});

describe("التقرير اليومي — الاستئناف والمهلة", () => {
  it("sent_at يُثبَّت بعد نجاح الإرسال فقط؛ الفشل لا يترك حجزاً", async () => {
    const s = await newShop();
    await seed(s, "2026-11-01", 1, served("2026-11-01"));
    clock = new Date("2026-11-02T02:00:00Z");
    failMail = true;
    expect((await sendDailyReports()).failed).toBeGreaterThanOrEqual(1);
    expect(await logRow(s, "2026-11-01")).toBeUndefined();
    failMail = false;
    await sendDailyReports();
    const row = await logRow(s, "2026-11-01");
    expect(row.sent_at).not.toBeNull();
    expect(mails.filter((m) => m.to === s.ownerEmail)).toHaveLength(1);
  });

  it("حجز معلّق أقدم من 10 دقائق (مهمّة انقطعت) يُستعاد؛ الأحدث يُترك لصاحبه", async () => {
    const crashed = await newShop();
    const busy = await newShop();
    for (const s of [crashed, busy]) await seed(s, "2026-11-03", 1, served("2026-11-03"));
    clock = new Date("2026-11-04T02:00:00Z");
    await db.query("insert into report_log (shop_id, day, claimed_at, sent_at) values ($1, $2, $3, null)", [
      crashed.id,
      "2026-11-03",
      new Date(clock.getTime() - 11 * 60_000),
    ]);
    await db.query("insert into report_log (shop_id, day, claimed_at, sent_at) values ($1, $2, $3, null)", [
      busy.id,
      "2026-11-03",
      new Date(clock.getTime() - 5 * 60_000),
    ]);
    await sendDailyReports();
    expect(mails.filter((m) => m.to === crashed.ownerEmail)).toHaveLength(1);
    expect((await logRow(crashed, "2026-11-03")).sent_at).not.toBeNull();
    expect(mails.filter((m) => m.to === busy.ownerEmail)).toHaveLength(0);
    // بعد 10 دقائق بلا إرسال ناجح: يُستعاد هو أيضاً
    clock = new Date(clock.getTime() + 6 * 60_000);
    await sendDailyReports();
    expect(mails.filter((m) => m.to === busy.ownerEmail)).toHaveLength(1);
    mails.length = 0;
    await sendDailyReports();
    expect(mails).toHaveLength(0);
  });

  it("كلّ تشغيل يغطّي آخر 3 أيّام بلا إرسال ناجح (يوم فات لا يضيع)", async () => {
    const s = await newShop();
    for (const d of ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"]) await seed(s, d, 1, served(d));
    // تقرير 11-09 أُرسل؛ 11-06 أقدم من النافذة
    await db.query("insert into report_log (shop_id, day, claimed_at, sent_at) values ($1, '2026-11-09', $2, $2)", [
      s.id,
      new Date("2026-11-10T02:00:00Z"),
    ]);
    clock = new Date("2026-11-11T02:00:00Z"); // الأمس = 11-10 (بلا تذاكر)
    const r = await sendDailyReports();
    expect(r.day).toBe("2026-11-10");
    expect(r.days).toEqual(["2026-11-10", "2026-11-09", "2026-11-08"]);
    const mine = mails.filter((m) => m.to === s.ownerEmail);
    expect(mine).toHaveLength(1);
    expect((await logRow(s, "2026-11-08")).sent_at).not.toBeNull();
    expect(await logRow(s, "2026-11-07")).toBeUndefined(); // خارج النافذة
  });

  it("إرسال متوازٍ محدود، ويتوقّف عند نفاد المهلة ثمّ يُستكمل في التشغيل التالي", async () => {
    const shops: Shop[] = [];
    for (let i = 0; i < 8; i++) {
      const s = await newShop();
      await seed(s, "2026-11-14", 1, served("2026-11-14"));
      shops.push(s);
    }
    clock = new Date("2026-11-15T02:00:00Z");
    const none = await sendDailyReports({ budgetMs: 0 });
    expect(none).toMatchObject({ sent: 0, failed: 0 });
    expect(none.pending).toBeGreaterThanOrEqual(8);
    for (const s of shops) expect(await logRow(s, "2026-11-14")).toBeUndefined();

    mailDelayMs = 20;
    const r = await sendDailyReports();
    expect(r.pending).toBe(0);
    for (const s of shops) expect(mails.filter((m) => m.to === s.ownerEmail)).toHaveLength(1);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(REPORT_CONCURRENCY);
  });

  it("runCron: فشل خطوة لا يُلغي ما بعدها، ويُعاد في errors", async () => {
    const s = await newShop();
    await seed(s, "2026-11-20", 1, served("2026-11-20"));
    clock = new Date("2026-11-21T02:00:00Z");
    await db.exec("alter table wa_inbound rename to wa_inbound_broken");
    try {
      const r = await svc.runCron();
      expect(r.errors.map((e) => e.step)).toEqual(["purgeWa"]);
      expect(typeof r.noShows).toBe("number"); // ما قبلها نُفّذ
      expect(r.reports?.sent).toBeGreaterThanOrEqual(1); // وما بعدها أيضاً
      expect(mails.filter((m) => m.to === s.ownerEmail)).toHaveLength(1);
    } finally {
      await db.exec("alter table wa_inbound_broken rename to wa_inbound");
    }
    expect((await svc.runCron()).errors).toEqual([]);
  });

  it("المعاينة: الإرسال الفاشل لا يستهلك من الحدّ", async () => {
    const s = await newShop();
    failMail = true;
    for (let i = 0; i < 4; i++) await expect(sendReportPreview(s)).rejects.toMatchObject({ code: "email_unavailable" });
    const rows = await db.query<{ n: number }>("select count(*)::int as n from report_previews where shop_id = $1", [s.id]);
    expect(rows[0].n).toBe(0);
    failMail = false;
    for (let i = 0; i < 3; i++) await sendReportPreview(s);
    await expect(sendReportPreview(s)).rejects.toMatchObject({ code: "report_rate_limited" });
    // طلبات متوازية لا تتجاوز الحدّ
    const t = await newShop();
    const r = await Promise.allSettled([1, 2, 3, 4, 5].map(() => sendReportPreview(t)));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(3);
  });
});

describe("ادعُ زميلاً", () => {
  it("رمز صالح: 90 يوماً للمدعوّ؛ مكافأة الداعي عند أوّل دفعة فقط", async () => {
    const a = await newShop();
    const code = await ensureReferralCode(db, a.id);
    expect(code).toMatch(/^[A-Z0-9]{7}$/);
    expect(await ensureReferralCode(db, a.id)).toBe(code);

    const b = await newShop(null, code.toLowerCase());
    expect(b.trialEndsAt.getTime() - clock.getTime()).toBe(90 * DAY);
    expect((await repo.getShopById(db, b.id))!.trialEndsAt.getTime()).toBe(b.trialEndsAt.getTime());

    const before = (await repo.getShopById(db, a.id))!;
    await recordManualPayment(b.id, 1, 1500, null);
    const after = (await repo.getShopById(db, a.id))!;
    expect(after.trialEndsAt.getTime() - before.trialEndsAt.getTime()).toBe(30 * DAY); // في التجربة: تُمدّد التجربة
    await recordManualPayment(b.id, 1, 1500, null);
    expect((await repo.getShopById(db, a.id))!.trialEndsAt.getTime()).toBe(after.trialEndsAt.getTime());

    const st = await referralStats(db, a.id, clock);
    expect(st).toMatchObject({ code, invited: 1, paid: 1, rewardedMonths: 1, capped: false });
  });

  it("الداعي المشترك: يُمدَّد paid_until", async () => {
    const a = await newShop();
    await recordManualPayment(a.id, 1, 1500, null);
    const paid = (await repo.getShopById(db, a.id))!.paidUntil!;
    const b = await newShop(null, await ensureReferralCode(db, a.id));
    await recordManualPayment(b.id, 12, 15000, null);
    expect((await repo.getShopById(db, a.id))!.paidUntil!.getTime() - paid.getTime()).toBe(30 * DAY);
  });

  it("رمز غير صالح يُتجاهل، والدعوة الذاتية مرفوضة، وحدّ 12 في السنة", async () => {
    const x = await newShop(null, "NOPE99");
    expect(x.trialEndsAt.getTime() - clock.getTime()).toBe(60 * DAY);
    const y = await newShop(null, "<script>");
    expect(y.trialEndsAt.getTime() - clock.getTime()).toBe(60 * DAY);

    const a = await newShop("same@example.com");
    const code = await ensureReferralCode(db, a.id);
    const self = await newShop("SAME@example.com", code);
    expect(self.trialEndsAt.getTime() - clock.getTime()).toBe(60 * DAY);
    expect((await referralStats(db, a.id, clock)).invited).toBe(0);

    const start = (await repo.getShopById(db, a.id))!.trialEndsAt.getTime();
    for (let i = 0; i < 13; i++) {
      const b = await newShop(null, code);
      await recordManualPayment(b.id, 1, 1500, null);
    }
    expect((await repo.getShopById(db, a.id))!.trialEndsAt.getTime() - start).toBe(12 * 30 * DAY);
    const st = await referralStats(db, a.id, clock);
    expect(st).toMatchObject({ invited: 13, paid: 13, rewardedMonths: 12, capped: true });
  });

  it("دفعة يدوية مجّانية (0 دج) لا تكافئ", async () => {
    const a = await newShop();
    const b = await newShop(null, await ensureReferralCode(db, a.id));
    const before = (await repo.getShopById(db, a.id))!.trialEndsAt.getTime();
    await recordManualPayment(b.id, 1, 0, "geste");
    expect((await repo.getShopById(db, a.id))!.trialEndsAt.getTime()).toBe(before);
  });
});

describe("ادعُ زميلاً — ضدّ الاستغلال", () => {
  const trialDays = (shop: Shop) => Math.round((shop.trialEndsAt.getTime() - clock.getTime()) / DAY);
  const invited = async (shop: Shop) => (await referralStats(db, shop.id, clock)).invited;

  it("مفتاح البريد: أحرف صغيرة، بلا +وسم، وبلا نقاط Gmail", async () => {
    const cases: [string | null, string | null][] = [
      ["D.r.X+clinic2@GoogleMail.com", "drx@gmail.com"],
      ["drx@gmail.com", "drx@gmail.com"],
      ["a.b+c@Example.com", "a.b@example.com"],
      ["+x@example.com", null],
      ["...@gmail.com", null],
      ["x@", null],
      [null, null],
    ];
    for (const [input, key] of cases) {
      const r = await db.query<{ k: string | null }>("select dawri_email_key($1::text) as k", [input]);
      expect(r[0].k, String(input)).toBe(key);
    }
  });

  it("دعوة ذاتية ببريد ثانٍ (نقاط Gmail / +وسم) مرفوضة", async () => {
    const a = await newShop("doc.tor@gmail.com");
    const code = await ensureReferralCode(db, a.id);
    const b = await newShop("D.octor+2@googlemail.com", code);
    expect(trialDays(b)).toBe(60);
    const c = await newShop("doc.tor+x@gmail.com", code);
    expect(trialDays(c)).toBe(60);
    expect(await invited(a)).toBe(0);
  });

  it("الداعي غيّر بريده: بريده القديم ما زال «هو»", async () => {
    const a = await newShop("first-owner@example.com");
    const code = await ensureReferralCode(db, a.id);
    await svc.updateSettings(a, { email: "second-owner@example.com" });
    const b = await newShop("first-owner@example.com", code);
    expect(trialDays(b)).toBe(60);
    expect(await invited(a)).toBe(0);
  });

  it("البريد إلزامي للطرفين", async () => {
    const a = await newShop();
    const code = await ensureReferralCode(db, a.id);
    await db.query("update shops set owner_email = null where id = $1", [a.id]);
    const b = await newShop("", code);
    expect(trialDays(b)).toBe(60);
    expect(await invited(a)).toBe(0);
  });

  it("بريد سبق استعماله لعيادة أخرى (ولو حُذفت): تُسجَّل الدعوة بلا 30 يوماً إضافية", async () => {
    const a = await newShop();
    const code = await ensureReferralCode(db, a.id);
    const first = await newShop("farm.er@gmail.com");
    const again = await newShop("farmer+2@gmail.com", code);
    expect(trialDays(again)).toBe(60);
    expect(await invited(a)).toBe(1); // الداعي يُكافأ إن دفعت فعلاً
    await db.query("delete from shops where id = $1", [first.id]);
    const third = await newShop("f.armer@gmail.com", code);
    expect(trialDays(third)).toBe(60);
    // بريد جديد تماماً: المكافأة كاملة
    const fresh = await newShop("brand-new-doctor@example.com", code);
    expect(trialDays(fresh)).toBe(90);
  });

  it("الدعوة ومكافأتها ذرّيتان: فشل المكافأة لا يترك دعوة مسجّلة", async () => {
    const a = await newShop();
    const code = await ensureReferralCode(db, a.id);
    // يُفشل تمديد التجربة (+30) ولا يمسّ إنشاء العيادة (60 يوماً)
    await db.exec(`alter table shops add constraint test_no_bonus check (trial_ends_at < '2027-01-01'::timestamptz) not valid`);
    let b: Shop;
    try {
      b = await newShop("", code);
    } finally {
      await db.exec("alter table shops drop constraint test_no_bonus");
    }
    expect(trialDays(b)).toBe(60);
    const rows = await db.query<{ n: number }>("select count(*)::int as n from referrals where referred_shop_id = $1", [b.id]);
    expect(rows[0].n).toBe(0);
    expect(await invited(a)).toBe(0);
  });
});
